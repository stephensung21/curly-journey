import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { makeHoldingsRepo } from '../src/db/holdings';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

const NOW = new Date('2026-10-24T02:00:00Z');
const HEADER = 'Date,Reference,Details,Debit($),Credit($),Balance($)';
const CSV = `${HEADER}\n24/10/2026,C1234567,B 15 VAS @ 102.450000,1546.75,,0.00\n`;

async function setup() {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => NOW });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body) });
  return { db, app, send };
}
type Summary = {
  accountId: number | null;
  valueCents: number;
  costCents: number;
  gainCents: number;
  gainBps: number;
  priceDate: string | null;
  holdings: { symbol: string; units: number; valueCents: number }[];
  trades: { id: number }[];
};

describe('holdings', () => {
  it('migration applies twice cleanly and adds the trade_hint pref', async () => {
    const { db, send } = await setup();
    await db.query('select 1'); // pgliteDb has applied it once
    const sql = readFileSync(join(__dirname, '..', 'migrations', '0006_holdings.sql'), 'utf8');
    // db.query is single-statement; split on statement ends outside of this simple file
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
    const prefs = (await (await send('GET', '/notifications/prefs')).json()) as Record<string, boolean>;
    expect(prefs.trade_hint).toBe(true);
  });

  it('GET /holdings is empty before any import', async () => {
    const { send } = await setup();
    const r = (await (await send('GET', '/holdings')).json()) as Summary;
    expect(r).toEqual({ accountId: null, valueCents: 0, costCents: 0, gainCents: 0, gainBps: 0, priceDate: null, holdings: [], trades: [] });
  });

  it('preview then import, creating the CommSec account; re-import inserts nothing', async () => {
    const { send, db } = await setup();
    const p1 = (await (await send('POST', '/holdings/import/preview', { csv: CSV })).json()) as { new: unknown[]; have: unknown[] };
    expect(p1.new).toHaveLength(1);
    expect(p1.have).toHaveLength(0);
    expect(await (await send('POST', '/holdings/import', { csv: CSV })).json()).toEqual({ imported: 1 });
    const acct = await db.query<{ counts_spending: boolean; counts_net_worth: boolean; projections: string; kind: string; balance_cents: string }>(
      "select counts_spending, counts_net_worth, projections, kind, balance_cents::text from account where source = 'commsec'",
    );
    expect(acct).toHaveLength(1);
    expect(acct[0]).toMatchObject({ counts_spending: false, counts_net_worth: true, projections: 'etf', kind: 'brokerage' });
    expect(acct[0]!.balance_cents).toBe('154675'); // no price yet: valued at cost
    const p2 = (await (await send('POST', '/holdings/import/preview', { csv: CSV })).json()) as { new: unknown[]; have: unknown[] };
    expect(p2.have).toHaveLength(1);
    expect(p2.new).toHaveLength(0);
    expect(await (await send('POST', '/holdings/import', { csv: CSV })).json()).toEqual({ imported: 0 });
    const s = (await (await send('GET', '/holdings')).json()) as Summary;
    expect(s.trades).toHaveLength(1);
  });

  it('import errors: bad csv, missing csv, too large', async () => {
    const { send } = await setup();
    expect((await send('POST', '/holdings/import', { csv: 5 })).status).toBe(400);
    expect((await send('POST', '/holdings/import/preview', {})).status).toBe(400);
    const big = await send('POST', '/holdings/import/preview', { csv: 'x'.repeat(2 * 1024 * 1024 + 10) });
    expect(big.status).toBe(413);
  });

  it('manual trade validation', async () => {
    const { send } = await setup();
    const ok = { date: '2026-10-20', side: 'buy', symbol: 'VAS', units: 10, price: '100.50', brokerage: '10.00' };
    for (const bad of [
      { ...ok, units: 0 },
      { ...ok, units: 1.5 },
      { ...ok, symbol: 'v!' },
      { ...ok, symbol: 'X' },
      { ...ok, date: '2026-13-40' },
      { ...ok, side: 'hold' },
      { ...ok, price: 'abc' },
      { ...ok, price: '0' },
      { ...ok, brokerage: '-1' },
    ]) {
      const r = await send('POST', '/holdings/trades', bad);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'bad_trade' });
    }
    const r = await send('POST', '/holdings/trades', { ...ok, symbol: 'vas' });
    expect(r.status).toBe(201);
    const { trade } = (await r.json()) as { trade: { id: number; symbol: string; totalCents: number; source: string } };
    expect(trade).toMatchObject({ symbol: 'VAS', totalCents: 100500 + 1000, source: 'manual' });
    expect((await send('POST', '/holdings/trades', ok)).status).toBe(201); // identical manual trade does not collide
  });

  it('delete updates the balance; 404 for unknown', async () => {
    const { send, db } = await setup();
    await send('POST', '/holdings/import', { csv: CSV });
    const t = await send('POST', '/holdings/trades', { date: '2026-10-20', side: 'buy', symbol: 'VGS', units: 2, price: '100', brokerage: '0' });
    const { trade } = (await t.json()) as { trade: { id: number } };
    const bal = async () => (await db.query<{ balance_cents: string }>("select balance_cents::text from account where source = 'commsec'"))[0]!.balance_cents;
    expect(await bal()).toBe(String(154675 + 20000));
    expect((await send('DELETE', `/holdings/trades/${trade.id}`)).status).toBe(204);
    expect(await bal()).toBe('154675');
    expect((await send('DELETE', `/holdings/trades/${trade.id}`)).status).toBe(404);
  });

  it('GET /holdings values with a seeded price', async () => {
    const { send, db } = await setup();
    await send('POST', '/holdings/import', { csv: CSV });
    await makeHoldingsRepo(db).upsertPrices([{ symbol: 'VAS', date: '2026-10-23', closeMicros: 110_000_000 }]);
    const s = (await (await send('GET', '/holdings')).json()) as Summary;
    expect(s.valueCents).toBe(165000);
    expect(s.costCents).toBe(154675);
    expect(s.gainCents).toBe(10325);
    expect(s.priceDate).toBe('2026-10-23');
    expect(s.holdings[0]).toMatchObject({ symbol: 'VAS', units: 15, valueCents: 165000 });
  });

  it('dismiss hint returns 204 and is idempotent', async () => {
    const { send, db } = await setup();
    await db.query("insert into account (source, external_id, institution, name, kind, counts_spending, counts_net_worth) values ('pocketsmith','1','I','N','transaction', true, true)");
    await db.query(
      "insert into transaction (account_id, source, external_id, date, amount_cents, description_raw) select id, 'pocketsmith','t1','2026-10-24',-100,'x' from account limit 1",
    );
    const id = (await db.query<{ id: string }>('select id::text from transaction'))[0]!.id;
    expect((await send('POST', `/holdings/hints/${id}/dismiss`)).status).toBe(204);
    expect((await send('POST', `/holdings/hints/${id}/dismiss`)).status).toBe(204);
    expect(await db.query('select * from trade_hint_dismissed')).toHaveLength(1);
  });
});
