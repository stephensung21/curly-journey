import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { Db } from '../src/db/db';
import { makeHoldingsRepo } from '../src/db/holdings';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

let n = 0;
const tx = (db: Db, accountId: number, date: string, cents: number) =>
  db.query(
    `insert into transaction (account_id, source, external_id, date, amount_cents, description_raw) values ($1, 'pocketsmith', $2, $3, $4, 'x')`,
    [accountId, `t${++n}`, date, cents],
  );

const NOW = new Date('2026-10-24T02:00:00Z');

async function setup() {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => NOW });
  const auth = { Authorization: `Bearer ${token}` };
  const get = (path: string) => app.request(path, { headers: auth });
  const acct = (source: string, ext: string, name: string, cents: number, offset = false) =>
    db.query(
      `insert into account (source, external_id, institution, name, kind, balance_cents, balance_date, counts_spending, counts_net_worth, is_offset)
       values ($1, $2, 'X', $3, 'transaction', $4, '2026-10-20', false, true, $5)`,
      [source, ext, name, cents, offset],
    );
  return { db, get, acct };
}
type Body = {
  totalCents: number; ownCents: number; oweCents: number;
  own: { name: string; valueCents: number; members?: unknown[] }[]; owe: { name: string }[];
  history: { date: string; totalCents: number }[];
  since: { fromDate: string; deltaCents: number } | null;
};

describe('GET /networth', () => {
  it('returns lines, totals, and history rebuilt from transactions, ignoring stored snapshots', async () => {
    const { db, get, acct } = await setup();
    await acct('pocketsmith', '1', 'Everyday', 500_000);
    await acct('pocketsmith', '2', 'Card', -100_000);
    // A snapshot taken while accounts were still being added must not drive the chart.
    await db.query("insert into net_worth_snapshot values ('2026-10-01', 0, -900000)");
    await tx(db, 1, '2026-10-02', 200_000);
    await tx(db, 1, '2026-10-16', -50_000);
    const r = await get('/networth?range=1M');
    expect(r.status).toBe(200);
    const b = (await r.json()) as Body;
    expect(b).toMatchObject({ totalCents: 400_000, ownCents: 500_000, oweCents: -100_000 });
    expect(b.own.map((l) => l.name)).toEqual(['Everyday']);
    expect(b.owe.map((l) => l.name)).toEqual(['Card']);
    expect(b.history).toEqual([
      { date: '2026-09-24', totalCents: 250_000 },
      { date: '2026-10-01', totalCents: 250_000 },
      { date: '2026-10-08', totalCents: 450_000 },
      { date: '2026-10-15', totalCents: 450_000 },
      { date: '2026-10-22', totalCents: 400_000 },
      { date: '2026-10-24', totalCents: 400_000 },
    ]);
    expect(b.since).toEqual({ fromDate: '2026-09-24', deltaCents: 150_000 });
  });

  it('values CommSec history from trades and stored closes', async () => {
    const { db, get } = await setup();
    const holdings = makeHoldingsRepo(db);
    const id = await holdings.ensureCommsecAccount(NOW);
    await holdings.insertTrades(id, [
      { date: '2026-06-10', reference: null, side: 'buy', symbol: 'VAS', units: 10, priceMicros: 100_000_000, brokerageCents: 0, totalCents: 100_000, source: 'csv', fingerprint: 'a' },
    ]);
    await holdings.upsertPrices([{ symbol: 'VAS', date: '2026-08-29', closeMicros: 120_000_000 }]);
    await holdings.setCommsecBalance(id, 130_000, '2026-10-23');
    const b = (await (await get('/networth?range=6M')).json()) as Body;
    expect(b.history.map((p) => [p.date, p.totalCents])).toEqual([
      ['2026-04-24', 0],
      ['2026-04-30', 0],
      ['2026-05-31', 0],
      ['2026-06-30', 100_000],
      ['2026-07-31', 100_000],
      ['2026-08-31', 120_000],
      ['2026-09-30', 120_000],
      ['2026-10-24', 130_000],
    ]);
  });

  it('groups offsets into one line', async () => {
    const { get, acct } = await setup();
    await acct('pocketsmith', '1', 'Offset A', 10_000, true);
    await acct('pocketsmith', '2', 'Offset B', 20_000, true);
    const b = (await (await get('/networth')).json()) as Body;
    expect(b.own).toHaveLength(1);
    expect(b.own[0]).toMatchObject({ name: 'Offsets (2)', valueCents: 30_000 });
    expect(b.own[0]!.members).toHaveLength(2);
  });

  it('applies growth to manual accounts live', async () => {
    const { db, get, acct } = await setup();
    await acct('manual', 'm1', 'House', 1_000_000);
    await db.query("update account set growth_bps = 1000 where source = 'manual'");
    const b = (await (await get('/networth')).json()) as Body;
    expect(b.totalCents).toBeGreaterThan(1_000_000);
  });

  it('All starts at the earliest transaction or trade, and the range is validated', async () => {
    const { db, get, acct } = await setup();
    await acct('pocketsmith', '1', 'Everyday', 100);
    await tx(db, 1, '2026-07-15', 50);
    const all = (await (await get('/networth?range=All')).json()) as Body;
    expect(all.history.map((h) => h.date)).toEqual(['2026-07-15', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-24']);
    expect(all.history[0]!.totalCents).toBe(100);
    expect(all.history[1]!.totalCents).toBe(100);
    expect((await get('/networth?range=2Y')).status).toBe(400);
    expect((await get('/networth?range=')).status).toBe(400);
  });
});
