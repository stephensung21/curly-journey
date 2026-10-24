import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

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
  it('returns lines, totals, and today appended to history', async () => {
    const { db, get, acct } = await setup();
    await acct('pocketsmith', '1', 'Everyday', 500_000);
    await acct('pocketsmith', '2', 'Card', -100_000);
    await db.query("insert into net_worth_snapshot values ('2026-10-20', 300000, -50000), ('2026-10-22', 350000, -50000)");
    const r = await get('/networth');
    expect(r.status).toBe(200);
    const b = (await r.json()) as Body;
    expect(b).toMatchObject({ totalCents: 400_000, ownCents: 500_000, oweCents: -100_000 });
    expect(b.own.map((l) => l.name)).toEqual(['Everyday']);
    expect(b.owe.map((l) => l.name)).toEqual(['Card']);
    expect(b.history).toEqual([
      { date: '2026-10-20', totalCents: 250_000 },
      { date: '2026-10-22', totalCents: 300_000 },
      { date: '2026-10-24', totalCents: 400_000 },
    ]);
    expect(b.since).toEqual({ fromDate: '2026-10-20', deltaCents: 150_000 });
  });

  it('keeps an existing snapshot for today instead of appending', async () => {
    const { db, get, acct } = await setup();
    await acct('pocketsmith', '1', 'Everyday', 500_000);
    await db.query("insert into net_worth_snapshot values ('2026-10-24', 1000, 0)");
    const b = (await (await get('/networth')).json()) as Body;
    expect(b.history).toEqual([{ date: '2026-10-24', totalCents: 1000 }]);
    expect(b.since).toBeNull();
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

  it('filters history by range and validates it', async () => {
    const { db, get, acct } = await setup();
    await acct('pocketsmith', '1', 'Everyday', 100);
    await db.query("insert into net_worth_snapshot values ('2025-01-01', 1, 0), ('2026-10-01', 2, 0)");
    const oneM = (await (await get('/networth?range=1M')).json()) as Body;
    expect(oneM.history.map((h) => h.date)).toEqual(['2026-10-01', '2026-10-24']);
    const all = (await (await get('/networth?range=All')).json()) as Body;
    expect(all.history).toHaveLength(3);
    expect((await get('/networth?range=2Y')).status).toBe(400);
    expect((await get('/networth?range=')).status).toBe(400);
  });
});
