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
  missingPrices: string[];
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
    expect(r).toEqual({ accountId: null, valueCents: 0, costCents: 0, gainCents: 0, gainBps: 0, priceDate: null, missingPrices: [], notUpdated: [], holdings: [], trades: [] });
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

  it('priceDate is the oldest held price; symbols with no price are in missingPrices', async () => {
    const { send, db } = await setup();
    const csv = `${HEADER}
24/10/2026,C1,B 15 VAS @ 102.450000,1546.75,,0.00
24/10/2026,C2,B 10 VGS @ 100.000000,1010.00,,0.00
24/10/2026,C3,B 5 VDHG @ 60.000000,310.00,,0.00
`;
    await send('POST', '/holdings/import', { csv });
    await makeHoldingsRepo(db).upsertPrices([
      { symbol: 'VAS', date: '2026-10-20', closeMicros: 110_000_000 },
      { symbol: 'VGS', date: '2026-10-23', closeMicros: 120_000_000 },
    ]);
    const s = (await (await send('GET', '/holdings')).json()) as Summary;
    expect(s.priceDate).toBe('2026-10-20');
    expect(s.missingPrices).toEqual(['VDHG']);
  });

  it('names held ETFs past the 10 that get daily prices', async () => {
    const { send } = await setup();
    const symbols = Array.from({ length: 12 }, (_, i) => `E${String(i).padStart(2, '0')}`);
    const csv = [HEADER, ...symbols.map((s, i) => `24/10/2026,C${i},B 1 ${s} @ 10.000000,10.00,,0.00`)].join('\n') + '\n';
    await send('POST', '/holdings/import', { csv });
    const s = (await (await send('GET', '/holdings')).json()) as Summary & { notUpdated: string[] };
    expect(s.notUpdated).toEqual(['E10', 'E11']);
  });

  it('missingPrices is empty when every holding has a price', async () => {
    const { send, db } = await setup();
    await send('POST', '/holdings/import', { csv: CSV });
    await makeHoldingsRepo(db).upsertPrices([{ symbol: 'VAS', date: '2026-10-23', closeMicros: 110_000_000 }]);
    expect(((await (await send('GET', '/holdings')).json()) as Summary).missingPrices).toEqual([]);
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

describe('manual trade then CSV import', () => {
  const manual = { date: '2026-10-22', side: 'buy', symbol: 'VAS', units: 15, price: '102.45', brokerage: '10.00' };
  it('matched CSV trade is HAVE; import replaces the manual row with the CSV row', async () => {
    const { send, db } = await setup();
    await send('POST', '/holdings/trades', manual);
    const p = (await (await send('POST', '/holdings/import/preview', { csv: CSV })).json()) as { new: unknown[]; have: unknown[] };
    expect(p.have).toHaveLength(1);
    expect(p.new).toHaveLength(0);
    expect(await (await send('POST', '/holdings/import', { csv: CSV })).json()).toEqual({ imported: 1 });
    const rows = await db.query<{ source: string; fingerprint: string }>('select source, fingerprint from trade');
    expect(rows).toEqual([{ source: 'csv', fingerprint: 'ref:C1234567' }]);
    const s = (await (await send('GET', '/holdings')).json()) as Summary;
    expect(s.holdings[0]).toMatchObject({ symbol: 'VAS', units: 15 });
    expect(s.costCents).toBe(154675);
    // second import: nothing more
    expect(await (await send('POST', '/holdings/import', { csv: CSV })).json()).toEqual({ imported: 0 });
  });

  it('leaves unrelated manual trades alone', async () => {
    const { send, db } = await setup();
    await send('POST', '/holdings/trades', { ...manual, symbol: 'VGS' });
    await send('POST', '/holdings/trades', { ...manual, date: '2026-10-10' });
    const p = (await (await send('POST', '/holdings/import/preview', { csv: CSV })).json()) as { new: unknown[]; have: unknown[] };
    expect(p.new).toHaveLength(1);
    await send('POST', '/holdings/import', { csv: CSV });
    expect(await db.query("select 1 from trade where source = 'manual'")).toHaveLength(2);
  });

  it('one manual trade is matched by at most one CSV trade', async () => {
    const { send, db } = await setup();
    await send('POST', '/holdings/trades', manual);
    const two = `${CSV}25/10/2026,C999,B 15 VAS @ 103.000000,1555.00,,0.00\n`;
    await send('POST', '/holdings/import', { csv: two });
    expect(await db.query("select 1 from trade where source = 'csv'")).toHaveLength(2);
    expect(await db.query("select 1 from trade where source = 'manual'")).toHaveLength(0);
  });

  it('rejects unsafe prices', async () => {
    const { send } = await setup();
    const r = await send('POST', '/holdings/trades', { ...manual, price: '9999999999999999999' });
    expect(r.status).toBe(400);
  });
});

describe('replacing manual trades on import', () => {
  const manual = { date: '2026-10-22', side: 'buy', symbol: 'VAS', units: 15, price: '102.45', brokerage: '12.00' };
  it('preview reports how many CSV trades replace manual ones', async () => {
    const { send } = await setup();
    await send('POST', '/holdings/trades', manual);
    const p = (await (await send('POST', '/holdings/import/preview', { csv: CSV })).json()) as { replacing: number };
    expect(p.replacing).toBe(1);
    const q = (await (await send('POST', '/holdings/import/preview', { csv: `${HEADER}\n` })).json()) as { replacing: number };
    expect(q.replacing).toBe(0);
  });

  it('import refreshes the balance after replacing even if no row reports inserted', async () => {
    const real = await pgliteDb();
    const token = await seedToken(real);
    // Runs the real insert but reports no new rows, as a conflict-skipped insert would.
    const db = {
      async query<T = Record<string, unknown>>(text: string, params?: unknown[]) {
        const rows = await real.query<T>(text, params);
        return text.includes('with gone as') ? [] : rows;
      },
    };
    const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => NOW });
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const post = (path: string, body: unknown) => app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
    await post('/holdings/trades', manual);
    const bal = async () => (await real.query<{ b: string }>("select balance_cents::text b from account where source = 'commsec'"))[0]!.b;
    expect(await bal()).toBe('154875'); // manual: 1536.75 + 12.00
    expect(await (await post('/holdings/import', { csv: CSV })).json()).toEqual({ imported: 0 });
    expect(await bal()).toBe('154675'); // CSV: 1536.75 + 10.00
  });
});

describe('dividends', () => {
  it('GET /holdings sums dividends from bank deposits, with yield on cost', async () => {
    const { send, db } = await setup();
    await send('POST', '/holdings/import', { csv: CSV }); // VAS, cost $1,546.75
    const bank = (await db.query<{ id: number }>(
      `insert into account (source, external_id, institution, name, kind, balance_cents, balance_date, counts_spending, counts_net_worth, projections)
       values ('pocketsmith', 'b1', 'CommBank', 'Everyday', 'transaction', 0, '2026-10-23', true, true, 'off') returning id`,
    ))[0]!.id;
    const cat = async (name: string) => (await db.query<{ id: number }>('select id from category where name = $1', [name]))[0]!.id;
    const add = (id: string, date: string, cents: number, desc: string, categoryId: number | null = null, source: string | null = null) =>
      db.query(
        `insert into transaction (account_id, source, external_id, date, amount_cents, description_raw, merchant, status, category_id, category_source)
         values ($1, 'pocketsmith', $2, $3, $4, $5, '', 'posted', $6, $7)`,
        [bank, id, date, cents, desc, categoryId, source],
      );
    await add('1', '2026-10-15', 5_000, 'Direct Credit VAS DST 001284'); // named ETF
    await add('2', '2026-07-16', 2_500, 'Transfer from broker', await cat('Dividends'), 'user'); // put in Dividends by hand
    await add('3', '2026-09-01', 9_000, 'VAS PAYMENT', await cat('Groceries'), 'user'); // sorted by hand elsewhere
    await add('4', '2026-10-01', 500_000, 'Salary ACME');
    await add('5', '2025-09-01', 4_000, 'VAS DST'); // over a year ago
    const s = (await (await send('GET', '/holdings')).json()) as { dividends: unknown };
    expect(s.dividends).toEqual({
      last12Cents: 7_500,
      fyCents: 7_500,
      yieldBps: 485,
      payments: [
        { transactionId: expect.any(Number), date: '2026-10-15', amountCents: 5_000, symbol: 'VAS' },
        { transactionId: expect.any(Number), date: '2026-07-16', amountCents: 2_500, symbol: null },
      ],
    });
  });
});
