import {
  isLikelyDuplicate,
  parseAmexRows,
  parseCommBankRows,
  rowFingerprints,
  type ImportedRow,
} from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import type { Db } from '../db/db';
import { makeRepo, type Repo } from '../db/repo';
import { PIPELINE_CALLS, runPipeline } from '../spending/pipeline';
import { MAX_CALLS } from '../sync/runSync';

const MAX_BYTES = 2 * 1024 * 1024;

type Preview = {
  new: ImportedRow[];
  duplicates: ImportedRow[];
  skipped: { line: number; reason: string }[];
  /** Storage keys for `new`, same order. Not sent to the client. */
  newKeys: string[];
};

class HttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 413,
    readonly code: string,
  ) {
    super(code);
  }
}

const shiftDay = (date: string, days: number): string =>
  new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + days)).toISOString().slice(0, 10);

async function readRequest(req: Request, repo: Repo) {
  const declared = req.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_BYTES + 1024) throw new HttpError(413, 'too_large');
  const text = await req.text();
  if (text.length > MAX_BYTES + 1024) throw new HttpError(413, 'too_large');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'bad_json');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'bad_body');
  const { accountId, format, csv } = body as Record<string, unknown>;
  if (typeof csv === 'string' && csv.length > MAX_BYTES) throw new HttpError(413, 'too_large');
  if (typeof accountId !== 'number' || !Number.isSafeInteger(accountId) || accountId < 1) throw new HttpError(400, 'bad_account');
  if (format !== 'commbank' && format !== 'amex') throw new HttpError(400, 'bad_format');
  if (typeof csv !== 'string') throw new HttpError(400, 'bad_csv');
  if (!(await repo.getAccount(accountId))) throw new HttpError(404, 'account_not_found');
  return { accountId, format: format as 'commbank' | 'amex', csv };
}

/** Shared by preview and commit so the commit never trusts the client. */
async function buildPreview(repo: Repo, accountId: number, format: 'commbank' | 'amex', csv: string): Promise<Preview> {
  const parsed = format === 'commbank' ? parseCommBankRows(csv) : parseAmexRows(csv);
  const { rows } = parsed;
  // Keys carry the account id: (source, external_id) is unique across all accounts.
  const keys = rowFingerprints(rows).map((fp) => `${accountId}:${fp}`);
  const out: Preview = { new: [], duplicates: [], skipped: parsed.skipped, newKeys: [] };
  if (!rows.length) return out;

  const known = await repo.existingCsvKeys(accountId, keys);
  const dates = rows.map((r) => r.date).sort();
  // Feed rows only (CSV rows are covered by `known`); each can explain at most one CSV row.
  const near = await repo.transactionsNear(accountId, shiftDay(dates[0]!, -2), shiftDay(dates[dates.length - 1]!, 2));

  rows.forEach((row, i) => {
    if (known.has(keys[i]!)) {
      out.duplicates.push(row);
      return;
    }
    const hit = near.findIndex((t) => isLikelyDuplicate(row, t));
    if (hit >= 0) {
      near.splice(hit, 1);
      out.duplicates.push(row);
    } else {
      out.new.push(row);
      out.newKeys.push(keys[i]!);
    }
  });
  return out;
}

export function importRoutes(deps: Deps) {
  const r = new Hono();
  const repo = makeRepo(deps.db);

  r.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code }, err.status);
    throw err;
  });

  r.post('/imports/preview', async (c) => {
    const { accountId, format, csv } = await readRequest(c.req.raw, repo);
    const p = await buildPreview(repo, accountId, format, csv);
    return c.json({ new: p.new, duplicates: p.duplicates, skipped: p.skipped });
  });

  r.post('/imports/commit', async (c) => {
    // Count queries like runSync does: the pipeline only runs if this request has room for it.
    let used = 0;
    const db: Db = {
      query(text, params) {
        used++;
        return deps.db.query(text, params);
      },
    };
    const counted = makeRepo(db);
    const { accountId, format, csv } = await readRequest(c.req.raw, counted);
    const p = await buildPreview(counted, accountId, format, csv);
    const inserted = await counted.insertCsvRows(
      accountId,
      p.new.map((row, i) => ({ row, fingerprint: p.newKeys[i]! })),
    );
    if (inserted && MAX_CALLS - used >= PIPELINE_CALLS) {
      const since = p.new.map((row) => row.date).sort()[0]!;
      try {
        await runPipeline(counted, { since, now: deps.now() });
      } catch (e) {
        // The rows are in and stay uncategorised; the next sync's pipeline picks them up.
        console.error('pipeline after import failed', e);
      }
    }
    return c.json({ inserted });
  });

  return r;
}
