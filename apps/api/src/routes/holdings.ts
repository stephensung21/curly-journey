import {
  grossCents,
  holdingsFromTrades,
  parseCommSecRows,
  parsePriceToMicros,
  sydneyDate,
  TRADE_HINT_DAYS,
  tradeFingerprint,
  valueHoldings,
  type ParsedTrade,
} from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeHoldingsRepo, type HoldingsRepo, type NewTrade } from '../db/holdings';
import { isObject, parseId } from './http';

const MAX_BYTES = 2 * 1024 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: 400 | 413,
    readonly code: string,
  ) {
    super(code);
  }
}

/** The request's csv field, with the same size cap and error codes as /imports. */
async function readCsv(req: Request): Promise<string> {
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
  if (!isObject(body)) throw new HttpError(400, 'bad_body');
  const { csv } = body;
  if (typeof csv === 'string' && csv.length > MAX_BYTES) throw new HttpError(413, 'too_large');
  if (typeof csv !== 'string') throw new HttpError(400, 'bad_csv');
  return csv;
}

/** Shared by preview and import so the import never trusts the client. */
async function buildPreview(repo: HoldingsRepo, csv: string) {
  const parsed = parseCommSecRows(csv);
  const fps = parsed.trades.map(tradeFingerprint);
  const known = await repo.existingFingerprints(fps);
  const fresh: NewTrade[] = [];
  const have: ParsedTrade[] = [];
  parsed.trades.forEach((t, i) => {
    const fp = fps[i]!;
    if (known.has(fp)) have.push(t);
    else {
      // Repeats inside one file share a fingerprint and would be dropped on insert: count them as seen.
      known.add(fp);
      fresh.push({ ...t, source: 'csv', fingerprint: fp });
    }
  });

  // A hand-entered trade the CSV now covers: same side, symbol and units within a few days.
  // Closest pairs win and each manual trade is used once. The CSV row replaces it.
  const accountId = fresh.length ? await repo.commsecAccountId() : null;
  const manual = accountId === null ? [] : (await repo.trades(accountId)).filter((t) => t.source === 'manual');
  const pairs: { f: number; m: number; gap: number }[] = [];
  fresh.forEach((f, fi) =>
    manual.forEach((m, mi) => {
      const gap = Math.abs(dayNum(f.date) - dayNum(m.date));
      if (f.side === m.side && f.symbol === m.symbol && f.units === m.units && gap <= TRADE_HINT_DAYS) pairs.push({ f: fi, m: mi, gap });
    }),
  );
  pairs.sort((a, b) => a.gap - b.gap || a.f - b.f || a.m - b.m);
  const usedF = new Set<number>();
  const usedM = new Set<number>();
  for (const p of pairs) {
    if (usedF.has(p.f) || usedM.has(p.m)) continue;
    usedF.add(p.f);
    usedM.add(p.m);
  }
  const replacing = fresh.filter((_, i) => usedF.has(i));
  have.push(...replacing);
  return {
    fresh: fresh.filter((_, i) => !usedF.has(i)),
    replacing,
    replaceIds: [...usedM].map((i) => manual[i]!.id),
    have,
    skipped: parsed.skipped,
    ignored: parsed.ignored,
  };
}

const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;

const SYMBOL = /^[A-Z0-9]{2,6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const MONEY = /^\d+(\.\d{1,2})?$/;

export function holdingsRoutes(deps: Deps) {
  const r = new Hono();
  const repo = makeHoldingsRepo(deps.db);

  r.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code }, err.status);
    throw err;
  });

  const valued = async (accountId: number) => {
    const trades = await repo.trades(accountId);
    const held = holdingsFromTrades(trades);
    const closes = await repo.latestCloses(held.map((h) => h.symbol));
    return { trades, holdings: valueHoldings(held, closes) };
  };

  /** Sets the CommSec balance to the current holdings value (cost where no price is known). */
  const refreshBalance = async (accountId: number) => {
    const { holdings } = await valued(accountId);
    await repo.setCommsecBalance(
      accountId,
      holdings.reduce((n, h) => n + h.valueCents, 0),
      sydneyDate(deps.now()),
    );
  };

  r.get('/holdings', async (c) => {
    const accountId = await repo.commsecAccountId();
    if (accountId === null) {
      return c.json({ accountId: null, valueCents: 0, costCents: 0, gainCents: 0, gainBps: 0, priceDate: null, missingPrices: [], holdings: [], trades: [] });
    }
    const { trades, holdings } = await valued(accountId);
    const valueCents = holdings.reduce((n, h) => n + h.valueCents, 0);
    const costCents = holdings.reduce((n, h) => n + h.costCents, 0);
    const gainCents = valueCents - costCents;
    const gainBps = costCents > 0 ? Math.round((gainCents * 10000) / costCents) : 0;
    const dates = holdings.map((h) => h.priceDate).filter((d): d is string => d !== null);
    const priceDate = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
    const missingPrices = holdings.filter((h) => h.priceDate === null).map((h) => h.symbol);
    return c.json({ accountId, valueCents, costCents, gainCents, gainBps, priceDate, missingPrices, holdings, trades });
  });

  r.post('/holdings/import/preview', async (c) => {
    const p = await buildPreview(repo, await readCsv(c.req.raw));
    return c.json({
      new: p.fresh.map(({ source: _s, fingerprint: _f, ...t }) => t),
      have: p.have,
      replacing: p.replacing.length,
      skipped: p.skipped,
      ignored: p.ignored,
    });
  });

  r.post('/holdings/import', async (c) => {
    const p = await buildPreview(repo, await readCsv(c.req.raw));
    let accountId = await repo.commsecAccountId();
    const rows = [...p.replacing, ...p.fresh];
    if (rows.length) accountId = await repo.ensureCommsecAccount(deps.now());
    const imported = accountId === null ? 0 : await repo.insertTrades(accountId, rows, p.replaceIds);
    if (accountId !== null && (imported > 0 || p.replaceIds.length > 0)) await refreshBalance(accountId);
    return c.json({ imported });
  });

  r.post('/holdings/trades', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_trade' }, 400);
    }
    const bad = c.json({ error: 'bad_trade' }, 400);
    if (!isObject(body)) return bad;
    const { date, side, units, price, brokerage } = body;
    const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
    if (typeof date !== 'string' || !validDate(date)) return bad;
    if (side !== 'buy' && side !== 'sell') return bad;
    if (!SYMBOL.test(symbol)) return bad;
    if (typeof units !== 'number' || !Number.isSafeInteger(units) || units < 1 || units > 2_000_000_000) return bad;
    if (typeof price !== 'string' || typeof brokerage !== 'string' || !MONEY.test(brokerage.trim())) return bad;
    let priceMicros: number;
    try {
      priceMicros = parsePriceToMicros(price);
    } catch {
      return bad;
    }
    if (!Number.isSafeInteger(priceMicros) || priceMicros <= 0) return bad;
    const brokerageCents = Math.round(Number(brokerage.trim()) * 100);
    if (!Number.isSafeInteger(brokerageCents)) return bad;
    const gross = grossCents(units, priceMicros);
    const totalCents = side === 'buy' ? gross + brokerageCents : gross - brokerageCents;
    if (!Number.isSafeInteger(totalCents) || totalCents <= 0) return bad;

    const accountId = await repo.ensureCommsecAccount(deps.now());
    const trade = await repo.insertTrade(accountId, {
      date, reference: null, side, symbol, units, priceMicros, brokerageCents, totalCents, source: 'manual',
      fingerprint: `manual:${crypto.randomUUID()}`,
    });
    await refreshBalance(accountId);
    return c.json({ trade }, 201);
  });

  r.delete('/holdings/trades/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null || !(await repo.deleteTrade(id))) return c.json({ error: 'not_found' }, 404);
    const accountId = await repo.commsecAccountId();
    if (accountId !== null) await refreshBalance(accountId);
    return c.body(null, 204);
  });

  r.post('/holdings/hints/:transactionId/dismiss', async (c) => {
    const id = parseId(c.req.param('transactionId'));
    if (id === null) return c.json({ error: 'not_found' }, 404);
    await repo.dismissHint(id);
    return c.body(null, 204);
  });

  return r;
}
