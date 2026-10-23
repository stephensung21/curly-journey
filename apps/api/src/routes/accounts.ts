import { isStale } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeRepo, type AccountSettingsPatch } from '../db/repo';

const BOOLS = ['countsSpending', 'countsNetWorth', 'isOffset'] as const;
const PROJECTIONS = ['off', 'etf', 'mortgage'];
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function parsePatch(body: unknown): AccountSettingsPatch | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const allowed = new Set<string>([...BOOLS, 'projections', 'displayName']);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.has(k)) return null;
    if ((BOOLS as readonly string[]).includes(k)) {
      if (typeof v !== 'boolean') return null;
    } else if (k === 'projections') {
      if (typeof v !== 'string' || !PROJECTIONS.includes(v)) return null;
    } else if (v !== null && typeof v !== 'string') {
      return null;
    }
    out[k] = v;
  }
  return out as AccountSettingsPatch;
}

const parseId = (s: string): number | null => (/^\d+$/.test(s) && Number(s) <= Number.MAX_SAFE_INTEGER ? Number(s) : null);

export function accountRoutes(deps: Deps) {
  const r = new Hono();
  const repo = makeRepo(deps.db);

  r.get('/accounts', async (c) => {
    const [accounts, last] = await Promise.all([repo.listAccounts(), repo.lastSuccessfulSync()]);
    const stale = isStale(last?.finishedAt ?? null, deps.now());
    return c.json({
      accounts: accounts.map((a) => ({ ...a, stale: a.source === 'pocketsmith' && stale })),
      lastSuccessAt: last ? last.finishedAt.toISOString() : null,
    });
  });

  r.patch('/accounts/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_json' }, 400);
    }
    const patch = parsePatch(body);
    if (!patch) return c.json({ error: 'bad_patch' }, 400);
    const updated = await repo.updateAccountSettings(id, patch);
    if (!updated) return c.json({ error: 'account_not_found' }, 404);
    return c.json(updated);
  });

  r.get('/accounts/:id/transactions', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    const month = c.req.query('month') ?? '';
    if (!MONTH.test(month)) return c.json({ error: 'bad_month' }, 400);
    if (!(await repo.getAccount(id))) return c.json({ error: 'account_not_found' }, 404);
    return c.json({ transactions: await repo.listTransactions(id, month) });
  });

  return r;
}
