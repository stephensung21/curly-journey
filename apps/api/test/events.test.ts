import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { makeEventsRepo } from '../src/db/events';
import { makeRepo } from '../src/db/repo';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

type Ev = { id: number; name: string; amountCents: number | null; accountId: number | null; repeat: string; startDate: string };
type Occ = { eventId: number; date: string; status: string | null; source: string | null; transactionId: number | null; payable: boolean };

async function setup() {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => new Date('2026-10-23T00:00:00Z') });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body) });
  const occ = async (from = '2026-10-01', to = '2026-12-31') =>
    (await (await call('GET', `/events/occurrences?from=${from}&to=${to}`)).json()) as { events: Ev[]; occurrences: Occ[] };
  const mortgage = (await makeEventsRepo(db).list()).find((e) => e.name === 'Mortgage repayment')!;
  return { db, call, occ, mortgage };
}

describe('events API', () => {
  it('lists seeded events and expands mortgage occurrences', async () => {
    const { call, occ, mortgage } = await setup();
    const list = (await (await call('GET', '/events')).json()) as { events: Ev[] };
    expect(list.events.map((e) => e.name).sort()).toEqual(['Amex statement closes', 'Mortgage repayment']);
    const r = await occ();
    expect(r.occurrences.filter((o) => o.eventId === mortgage.id).map((o) => o.date)).toEqual(['2026-10-28', '2026-11-28', '2026-12-28']);
    const dates = r.occurrences.map((o) => o.date);
    expect(dates).toEqual([...dates].sort());
    expect(r.occurrences[0]).toMatchObject({ status: null, source: null, transactionId: null, payable: false });
  });

  it('validates event input', async () => {
    const { call } = await setup();
    const ok = { name: 'Rent', emoji: 'R', amountCents: 5000, accountId: null, startDate: '2026-11-01', repeat: 'weekly', leadDays: 2, onDayAlert: true };
    for (const bad of [
      { ...ok, name: '   ' }, { ...ok, name: 'x'.repeat(61) }, { ...ok, emoji: '' }, { ...ok, amountCents: 0 },
      { ...ok, amountCents: 1.5 }, { ...ok, accountId: 99999 }, { ...ok, startDate: '2026-02-30' },
      { ...ok, repeat: 'daily' }, { ...ok, leadDays: 15 }, { ...ok, onDayAlert: 'yes' },
    ]) {
      const res = await call('POST', '/events', bad);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_event' });
    }
    const res = await call('POST', '/events', { ...ok, name: ' Rent ' });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ name: 'Rent', amountCents: 5000, repeat: 'weekly' });
  });

  it('patches and deletes; unknown id is 404', async () => {
    const { call, mortgage } = await setup();
    const p = await call('PATCH', `/events/${mortgage.id}`, { amountCents: 250000, name: 'Home loan' });
    expect(await p.json()).toMatchObject({ id: mortgage.id, name: 'Home loan', amountCents: 250000 });
    expect((await call('PATCH', `/events/${mortgage.id}`, { leadDays: 99 })).status).toBe(400);
    expect(await (await call('PATCH', '/events/99999', { name: 'x' })).json()).toEqual({ error: 'event_not_found' });
    expect((await call('DELETE', '/events/99999')).status).toBe(404);
    expect((await call('DELETE', `/events/${mortgage.id}`)).status).toBe(204);
  });

  it('sets and clears a user status', async () => {
    const { call, occ, mortgage } = await setup();
    const put = await call('PUT', `/events/${mortgage.id}/occurrences/2026-11-28`, { status: 'paid' });
    expect(put.status).toBe(200);
    const find = async () => (await occ()).occurrences.find((o) => o.eventId === mortgage.id && o.date === '2026-11-28')!;
    expect(await find()).toMatchObject({ status: 'paid', source: 'user' });
    await call('PUT', `/events/${mortgage.id}/occurrences/2026-11-28`, { status: null });
    expect(await find()).toMatchObject({ status: null, source: null });
    const bad = await call('PUT', `/events/${mortgage.id}/occurrences/2026-11-27`, { status: 'paid' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'not_an_occurrence' });
    expect((await call('PUT', `/events/${mortgage.id}/occurrences/2026-11-28`, { status: 'done' })).status).toBe(400);
    expect((await call('PUT', '/events/99999/occurrences/2026-11-28', { status: 'paid' })).status).toBe(404);
  });

  it('rejects ranges over 120 days or malformed', async () => {
    const { call } = await setup();
    const r = await call('GET', '/events/occurrences?from=2026-01-01&to=2026-05-02');
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'bad_range' });
    expect((await call('GET', '/events/occurrences?from=2026-01-01&to=2026-04-30')).status).toBe(200);
    expect((await call('GET', '/events/occurrences?from=x&to=y')).status).toBe(400);
    expect((await call('GET', '/events/occurrences?from=2026-02-01&to=2026-01-01')).status).toBe(400);
  });

  it('insertAutoPaid keeps user status; takenTransactionIds sees linked ids', async () => {
    const { db, call, mortgage } = await setup();
    const events = makeEventsRepo(db);
    const repo = makeRepo(db);
    const acct = await repo.upsertAccount({ source: 'pocketsmith', externalId: '1', institution: 'CB', name: 'E', kind: 'transaction', balanceCents: 0, balanceDate: '2026-10-22' });
    await repo.upsertFeedTransactions([{ accountId: acct, row: { source: 'pocketsmith', externalId: 't1', accountExternalId: '1', date: '2026-11-28', amountCents: -100, descriptionRaw: 'D', payee: 'p', status: 'posted', merchant: '', psCategory: null, memo: null, feedCreatedAt: '2026-11-28T00:00:00Z' } }]);
    const txId = Number((await db.query<{ id: string }>('select id::text as id from transaction'))[0]!.id);
    await call('PUT', `/events/${mortgage.id}/occurrences/2026-11-28`, { status: 'skipped' });
    const n = await events.insertAutoPaid([
      { eventId: mortgage.id, date: '2026-11-28', transactionId: txId },
      { eventId: mortgage.id, date: '2026-12-28', transactionId: txId },
    ]);
    expect(n).toBe(1);
    expect(await events.insertAutoPaid([])).toBe(0);
    const st = await events.statuses('2026-11-01', '2026-12-31');
    expect(st).toEqual([
      { eventId: mortgage.id, date: '2026-11-28', status: 'skipped', source: 'user', transactionId: null },
      { eventId: mortgage.id, date: '2026-12-28', status: 'paid', source: 'auto', transactionId: txId },
    ]);
    expect([...(await events.takenTransactionIds('2026-11-01', '2026-12-31'))]).toEqual([txId]);
    expect((await events.takenTransactionIds('2026-10-01', '2026-11-30')).size).toBe(0);
  });

  it('deleting an event cascades its statuses', async () => {
    const { db, call, mortgage } = await setup();
    await call('PUT', `/events/${mortgage.id}/occurrences/2026-11-28`, { status: 'paid' });
    await call('DELETE', `/events/${mortgage.id}`);
    expect(await db.query('select 1 from event_occurrence')).toHaveLength(0);
  });
});
