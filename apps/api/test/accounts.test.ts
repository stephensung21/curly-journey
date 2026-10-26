import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { makeRepo } from '../src/db/repo';
import { pgliteDb, seedToken, fakePocketSmith } from './helpers';

const T0 = new Date('2026-10-23T00:00:00Z');

async function setup(now = T0) {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const repo = makeRepo(db);
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => now });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const ps = await repo.upsertAccount({ source: 'pocketsmith', externalId: '1', institution: 'CBA', name: 'Everyday', kind: 'transaction', balanceCents: 100, balanceDate: '2026-10-22' });
  const manual = Number((await db.query<{ id: number }>("insert into account (source, external_id, institution, name, kind, counts_spending, counts_net_worth) values ('manual', 'm1', 'Me', 'House', 'manual_asset', false, true) returning id"))[0]!.id);
  return { db, repo, app, auth, ps, manual };
}
const patch = (app: ReturnType<typeof createApp>, auth: Record<string, string>, id: number | string, body: unknown) =>
  app.request(`/accounts/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify(body) });

type Acct = { id: number; stale: boolean; isOffset: boolean; displayName: string | null };

describe('GET /accounts', () => {
  it('returns accounts with stale flag and lastSuccessAt', async () => {
    const { app, auth, repo, ps, manual } = await setup();
    let body = (await (await app.request('/accounts', { headers: auth })).json()) as { accounts: Acct[]; lastSuccessAt: string | null };
    expect(body.lastSuccessAt).toBeNull();
    expect(body.accounts.find((a) => a.id === ps)!.stale).toBe(true);
    expect(body.accounts.find((a) => a.id === manual)!.stale).toBe(false);
    const id = (await repo.startSync(new Date('2026-10-22T23:00:00Z')))!;
    await repo.finishSync(id, { status: 'ok' }, new Date('2026-10-22T23:01:00Z'));
    body = (await (await app.request('/accounts', { headers: auth })).json()) as typeof body;
    expect(body.lastSuccessAt).toBe('2026-10-22T23:01:00.000Z');
    expect(body.accounts.find((a) => a.id === ps)!.stale).toBe(false);
  });
});

describe('GET /accounts stale and needsUpdate', () => {
  type Row = Acct & { needsUpdate: boolean; syncedAt: string | null };
  const list = async (app: ReturnType<typeof createApp>, auth: Record<string, string>) =>
    ((await (await app.request('/accounts', { headers: auth })).json()) as { accounts: Row[] }).accounts;

  it('PocketSmith stale follows the global last-successful-sync rule; manual is never stale', async () => {
    const { app, auth, repo, ps, manual } = await setup();
    const old = await repo.startSync(new Date('2026-10-10T00:00:00Z'));
    await repo.finishSync(old!, { status: 'ok' }, new Date('2026-10-10T00:01:00Z'));
    let rows = await list(app, auth);
    expect(rows.find((a) => a.id === ps)!.stale).toBe(true);
    expect(rows.find((a) => a.id === manual)!.stale).toBe(false);
    expect(rows.find((a) => a.id === ps)!.needsUpdate).toBe(false);
    const fresh = await repo.startSync(new Date('2026-10-22T23:00:00Z'));
    await repo.finishSync(fresh!, { status: 'ok' }, new Date('2026-10-22T23:01:00Z'));
    rows = await list(app, auth);
    expect(rows.find((a) => a.id === ps)!.stale).toBe(false);
    expect(rows.find((a) => a.id === manual)!.stale).toBe(false);
  });

  it('CoinSpot stale follows its own synced_at, not the global sync', async () => {
    const { app, auth, db, repo } = await setup();
    const fresh = await repo.startSync(new Date('2026-10-22T23:00:00Z'));
    await repo.finishSync(fresh!, { status: 'ok' }, new Date('2026-10-22T23:01:00Z'));
    const id = Number((await db.query<{ id: number }>("insert into account (source, external_id, institution, name, kind, counts_spending, counts_net_worth, synced_at) values ('coinspot', 'coinspot', 'CoinSpot', 'CoinSpot', 'crypto', false, true, $1) returning id", [new Date(T0.getTime() - 2 * 86400_000)]))[0]!.id);
    let a = (await list(app, auth)).find((x) => x.id === id)!;
    expect(a.stale).toBe(true);
    expect(a.syncedAt).toBe('2026-10-21T00:00:00.000Z');
    await db.query('update account set synced_at = $1 where id = $2', [new Date(T0.getTime() - 3600_000), id]);
    a = (await list(app, auth)).find((x) => x.id === id)!;
    expect(a.stale).toBe(false);
  });
});

describe('PATCH /accounts/:id', () => {
  it('hides and unhides an account; new accounts are shown, and a sync keeps the choice', async () => {
    const { app, auth, ps, repo } = await setup();
    const list = async () => ((await (await app.request('/accounts', { headers: auth })).json()) as { accounts: (Acct & { hidden: boolean })[] }).accounts;
    expect((await list()).find((a) => a.id === ps)!.hidden).toBe(false);
    const res = await patch(app, auth, ps, { hidden: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { hidden: boolean }).hidden).toBe(true);
    await repo.upsertAccount({ source: 'pocketsmith', externalId: '1', institution: 'CBA', name: 'Everyday', kind: 'transaction', balanceCents: 9, balanceDate: '2026-10-23' });
    expect((await list()).find((a) => a.id === ps)!.hidden).toBe(true);
    await patch(app, auth, ps, { hidden: false });
    expect((await list()).find((a) => a.id === ps)!.hidden).toBe(false);
    expect((await patch(app, auth, ps, { hidden: 'yes' })).status).toBe(400);
  });

  it('persists isOffset', async () => {
    const { app, auth, ps } = await setup();
    const res = await patch(app, auth, ps, { isOffset: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Acct).isOffset).toBe(true);
    const list = (await (await app.request('/accounts', { headers: auth })).json()) as { accounts: Acct[] };
    expect(list.accounts.find((a) => a.id === ps)!.isOffset).toBe(true);
  });
  it('accepts displayName string or null', async () => {
    const { app, auth, ps } = await setup();
    expect(((await (await patch(app, auth, ps, { displayName: 'Mine' })).json()) as Acct).displayName).toBe('Mine');
    expect(((await (await patch(app, auth, ps, { displayName: null })).json()) as Acct).displayName).toBeNull();
  });
  it('400 on bad projections, unknown key, wrong type, non-object, bad json', async () => {
    const { app, auth, ps } = await setup();
    for (const body of [{ projections: 'nope' }, { name: 'x' }, { isOffset: 'yes' }, { displayName: 5 }, [1], 'str']) {
      const res = await patch(app, auth, ps, body);
      expect(res.status).toBe(400);
      expect(Object.keys((await res.json()) as object)).toEqual(['error']);
    }
    const bad = await app.request(`/accounts/${ps}`, { method: 'PATCH', headers: auth, body: '{nope' });
    expect(bad.status).toBe(400);
  });
  it('404 on unknown id, 400 on non-numeric id', async () => {
    const { app, auth } = await setup();
    expect((await patch(app, auth, 999, { isOffset: true })).status).toBe(404);
    expect((await patch(app, auth, 'abc', { isOffset: true })).status).toBe(400);
  });
});

describe('GET /accounts/:id/transactions', () => {
  it('400 on bad month', async () => {
    const { app, auth, ps } = await setup();
    for (const m of ['2026-13', '', 'abc', '2026-1']) {
      expect((await app.request(`/accounts/${ps}/transactions?month=${m}`, { headers: auth })).status).toBe(400);
    }
    expect((await app.request(`/accounts/${ps}/transactions`, { headers: auth })).status).toBe(400);
  });
  it('lists the month', async () => {
    const { app, auth, ps, repo } = await setup();
    await repo.insertCsvRows(ps, [
      { row: { date: '2026-10-05', amountCents: -500, description: 'COFFEE' }, fingerprint: 'a' },
      { row: { date: '2026-09-30', amountCents: -100, description: 'OLD' }, fingerprint: 'b' },
    ]);
    const body = (await (await app.request(`/accounts/${ps}/transactions?month=2026-10`, { headers: auth })).json()) as { transactions: unknown[] };
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0]).toMatchObject({ description: 'COFFEE', amountCents: -500 });
  });
  it('404 on unknown account', async () => {
    const { app, auth } = await setup();
    expect((await app.request('/accounts/999/transactions?month=2026-10', { headers: auth })).status).toBe(404);
  });
});

describe('account icon', () => {
  it('round-trips an emoji and resets with null', async () => {
    const { app, auth, ps } = await setup();
    expect(((await (await patch(app, auth, ps, { icon: '🐷' })).json()) as { icon: string | null }).icon).toBe('🐷');
    const list = (await (await app.request('/accounts', { headers: auth })).json()) as { accounts: { id: number; icon: string | null }[] };
    expect(list.accounts.find((a) => a.id === ps)!.icon).toBe('🐷');
    expect(((await (await patch(app, auth, ps, { icon: null })).json()) as { icon: string | null }).icon).toBeNull();
  });
  it('accepts 8 code units, rejects 9, empty and non-strings', async () => {
    const { app, auth, ps } = await setup();
    expect((await patch(app, auth, ps, { icon: '12345678' })).status).toBe(200);
    for (const icon of ['123456789', '', '   ', 5]) {
      const res = await patch(app, auth, ps, { icon });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_patch' });
    }
  });
  it('sync upsert keeps icon and sort_order', async () => {
    const { app, auth, ps, repo } = await setup();
    await patch(app, auth, ps, { icon: '🐷' });
    await app.request('/accounts/order', { method: 'PUT', headers: auth, body: JSON.stringify({ ids: [ps] }) });
    await repo.upsertAccount({ source: 'pocketsmith', externalId: '1', institution: 'CBA', name: 'Everyday', kind: 'transaction', balanceCents: 5, balanceDate: '2026-10-22' });
    const a = (await repo.getAccount(ps))!;
    expect(a.icon).toBe('🐷');
    expect(a.sortOrder).toBe(1);
  });
});

describe('PUT /accounts/order', () => {
  const put = (app: ReturnType<typeof createApp>, auth: Record<string, string>, body: unknown) =>
    app.request('/accounts/order', { method: 'PUT', headers: auth, body: JSON.stringify(body) });
  const ids = async (app: ReturnType<typeof createApp>, auth: Record<string, string>) =>
    ((await (await app.request('/accounts', { headers: auth })).json()) as { accounts: { id: number }[] }).accounts.map((a) => a.id);

  it('reorders the list', async () => {
    const { app, auth, repo } = await setup();
    await repo.upsertAccount({ source: 'pocketsmith', externalId: '2', institution: 'CBA', name: 'Third', kind: 'transaction', balanceCents: 1, balanceDate: '2026-10-22' });
    const before = await ids(app, auth);
    expect(before).toHaveLength(3);
    const want = [before[2]!, before[0]!, before[1]!];
    const res = await put(app, auth, { ids: want });
    expect(res.status).toBe(200);
    expect(await ids(app, auth)).toEqual(want);
  });
  it('unlisted accounts sort after listed ones', async () => {
    const { app, auth, ps, manual } = await setup();
    await put(app, auth, { ids: [manual] });
    expect(await ids(app, auth)).toEqual([manual, ps]);
  });
  it('400 bad_order on duplicate, unknown, non-integer, empty body shapes', async () => {
    const { app, auth, ps, manual } = await setup();
    for (const body of [{ ids: [ps, ps] }, { ids: [ps, 999] }, { ids: [1.5] }, { ids: [0] }, { ids: ['1'] }, { ids: 'x' }, {}, []]) {
      const res = await put(app, auth, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_order' });
    }
    expect(await ids(app, auth)).toEqual([ps, manual]);
  });
  it('401 without token', async () => {
    const { app } = await setup();
    expect((await app.request('/accounts/order', { method: 'PUT', body: '{"ids":[1]}' })).status).toBe(401);
  });
});

describe('PATCH /accounts/:id growthBps', () => {
  it('sets and clears growthBps on a manual account', async () => {
    const { app, auth, manual } = await setup();
    let r = await patch(app, auth, manual, { growthBps: 450 });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { growthBps: number | null }).growthBps).toBe(450);
    r = await patch(app, auth, manual, { growthBps: null });
    expect(((await r.json()) as { growthBps: number | null }).growthBps).toBeNull();
  });

  it('rejects out-of-range or non-integer values', async () => {
    const { app, auth, manual } = await setup();
    for (const v of [2001, -2001, 1.5, '5']) expect((await patch(app, auth, manual, { growthBps: v })).status).toBe(400);
  });

  it('rejects growthBps on a non-manual account', async () => {
    const { app, auth, ps } = await setup();
    expect((await patch(app, auth, ps, { growthBps: 100 })).status).toBe(400);
  });

  it('lists growthBps (null by default)', async () => {
    const { app, auth, manual } = await setup();
    const body = (await (await app.request('/accounts', { headers: auth })).json()) as { accounts: { id: number; growthBps: number | null }[] };
    expect(body.accounts.find((a) => a.id === manual)!.growthBps).toBeNull();
  });
});
