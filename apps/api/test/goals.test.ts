import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { Db } from '../src/db/db';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

const NOW = new Date('2026-10-26T02:00:00Z'); // 26 Oct, Sydney

async function setup() {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => NOW });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body) });
  return { db, send };
}

async function account(db: Db, externalId: string, kind: string, balanceCents: number, countsNetWorth = true, projections = 'off') {
  const rows = await db.query<{ id: number }>(
    `insert into account (source, external_id, institution, name, kind, balance_cents, balance_date, counts_spending, counts_net_worth, projections)
     values ('pocketsmith', $1, 'CommBank', $1, $2, $3, '2026-10-25', $2 = 'transaction', $4, $5) returning id`,
    [externalId, kind, balanceCents, countsNetWorth, projections],
  );
  return Number(rows[0]!.id);
}

type GoalsBody = {
  goals: { id: number; name: string; currentCents: number; percent: number; monthlyNeededCents: number | null; accountIds: number[] }[];
  fi: { yearlySpendingCents: number; fiNumberCents: number; investedCents: number; percent: number };
};

describe('goals', () => {
  it('tracks net worth by default, or chosen accounts, with progress', async () => {
    const { db, send } = await setup();
    const everyday = await account(db, 'everyday', 'transaction', 200_000);
    const savings = await account(db, 'savings', 'savings', 800_000);
    await account(db, 'loan', 'mortgage', -500_000);
    await account(db, 'hidden', 'savings', 9_999_999, false);

    const nw = await send('POST', '/goals', { name: ' House deposit ', emoji: '🏡', targetCents: 1_000_000, targetDate: null, accountIds: [] });
    expect(nw.status).toBe(201);
    const trip = await send('POST', '/goals', { name: 'Japan', emoji: '✈️', targetCents: 1_000_000, targetDate: '2027-10-26', accountIds: [savings] });
    expect(trip.status).toBe(201);

    const body = (await (await send('GET', '/goals')).json()) as GoalsBody;
    expect(body.goals).toEqual([
      expect.objectContaining({ name: 'House deposit', currentCents: 500_000, percent: 50, monthlyNeededCents: null, accountIds: [] }),
      expect.objectContaining({ name: 'Japan', currentCents: 800_000, percent: 80, monthlyNeededCents: 16_667, accountIds: [savings] }),
    ]);
    expect(everyday).toBeGreaterThan(0);
  });

  it('edits and deletes', async () => {
    const { send } = await setup();
    const created = (await (await send('POST', '/goals', { name: 'Car', emoji: '🚗', targetCents: 100, targetDate: null, accountIds: [] })).json()) as { id: number };
    const patched = await send('PATCH', `/goals/${created.id}`, { targetCents: 2_000_000, targetDate: '2028-01-01' });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ id: created.id, name: 'Car', targetCents: 2_000_000, targetDate: '2028-01-01' });
    expect((await send('DELETE', `/goals/${created.id}`)).status).toBe(204);
    expect((await send('DELETE', `/goals/${created.id}`)).status).toBe(404);
    expect((await send('PATCH', `/goals/${created.id}`, { name: 'x' })).status).toBe(404);
  });

  it('rejects bad goals', async () => {
    const { send } = await setup();
    const ok = { name: 'Car', emoji: '🚗', targetCents: 100, targetDate: null, accountIds: [] };
    const err = async (body: object) => (await send('POST', '/goals', body)).status;
    expect(await err({ ...ok, name: '' })).toBe(400);
    expect(await err({ ...ok, targetCents: 0 })).toBe(400);
    expect(await err({ ...ok, targetCents: 1.5 })).toBe(400);
    expect(await err({ ...ok, targetDate: '2027-02-30' })).toBe(400);
    expect(await err({ ...ok, accountIds: [99999] })).toBe(400);
    expect(await err({ ...ok, accountIds: 'all' })).toBe(400);
  });

  it('FI: 25 times the last 12 months of spending, against invested accounts', async () => {
    const { db, send } = await setup();
    const everyday = await account(db, 'everyday', 'transaction', 100_000);
    await account(db, 'etfs', 'brokerage', 3_000_000, true, 'etf');
    await account(db, 'coins', 'crypto', 1_000_000);
    const spend = (id: string, date: string, cents: number) =>
      db.query(
        `insert into transaction (account_id, source, external_id, date, amount_cents, description_raw, merchant, status)
         values ($1, 'pocketsmith', $2, $3, $4, 'Shop', '', 'posted')`,
        [everyday, id, date, cents],
      );
    await spend('1', '2026-10-01', -1_000_000);
    await spend('2', '2026-01-15', -600_000);
    await spend('3', '2025-09-01', -5_000_000); // more than a year ago
    const body = (await (await send('GET', '/goals')).json()) as GoalsBody;
    expect(body.fi).toEqual({ yearlySpendingCents: 1_600_000, fiNumberCents: 40_000_000, investedCents: 4_000_000, percent: 10 });
  });
});
