import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { makeManualRepo } from '../src/db/manual';
import { makeRepo } from '../src/db/repo';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

const NOW = new Date('2026-10-24T02:00:00Z');

async function setup() {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const repo = makeRepo(db);
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => NOW });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const ps = await repo.upsertAccount({ source: 'pocketsmith', externalId: '1', institution: 'CBA', name: 'Everyday', kind: 'transaction', balanceCents: 100, balanceDate: '2026-10-23' });
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body) });
  return { db, app, auth, ps, send };
}
type Acct = { id: number; institution: string; countsSpending: boolean; countsNetWorth: boolean; projections: string; kind: string; icon: string | null; balanceCents: number; balanceDate: string; needsUpdate: boolean; stale: boolean; syncedAt: string | null };
const amp = { name: 'AMP super', icon: 'bank', valueCents: 8_500_000, asOf: '2026-07-24' };

describe('manual accounts', () => {
  it('POST creates a manual account that needs an update', async () => {
    const { send } = await setup();
    const res = await send('POST', '/accounts/manual', amp);
    expect(res.status).toBe(201);
    const a = (await res.json()) as Acct;
    expect(a).toMatchObject({ institution: 'Manual', kind: 'manual_asset', countsSpending: false, countsNetWorth: true, projections: 'off', balanceCents: 8_500_000, balanceDate: '2026-07-24', icon: 'bank' });
    const list = (await (await send('GET', '/accounts')).json()) as { accounts: Acct[] };
    const got = list.accounts.find((x) => x.id === a.id)!;
    expect(got.needsUpdate).toBe(true);
    expect(got.stale).toBe(false);
    expect(((await (await send('GET', `/accounts/${a.id}/values`)).json()) as { values: unknown[] }).values).toHaveLength(1);
  });

  it('PUT value as of today clears needsUpdate and sets the balance', async () => {
    const { send } = await setup();
    const a = (await (await send('POST', '/accounts/manual', amp)).json()) as Acct;
    const res = await send('PUT', `/accounts/${a.id}/value`, { valueCents: 9_000_000, asOf: '2026-10-24' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ balanceCents: 9_000_000, balanceDate: '2026-10-24' });
    const list = (await (await send('GET', '/accounts')).json()) as { accounts: Acct[] };
    expect(list.accounts.find((x) => x.id === a.id)!.needsUpdate).toBe(false);
  });

  it('PUT an older value keeps the latest balance; history is newest first; same date upserts', async () => {
    const { send } = await setup();
    const a = (await (await send('POST', '/accounts/manual', amp)).json()) as Acct;
    await send('PUT', `/accounts/${a.id}/value`, { valueCents: 9_000_000, asOf: '2026-10-24' });
    const res = await send('PUT', `/accounts/${a.id}/value`, { valueCents: 8_000_000, asOf: '2026-04-24' });
    expect(await res.json()).toMatchObject({ balanceCents: 9_000_000, balanceDate: '2026-10-24' });
    await send('PUT', `/accounts/${a.id}/value`, { valueCents: 9_100_000, asOf: '2026-10-24' });
    const { values } = (await (await send('GET', `/accounts/${a.id}/values`)).json()) as { values: { asOf: string; valueCents: number }[] };
    expect(values).toEqual([
      { asOf: '2026-10-24', valueCents: 9_100_000 },
      { asOf: '2026-07-24', valueCents: 8_500_000 },
      { asOf: '2026-04-24', valueCents: 8_000_000 },
    ]);
  });

  it('400 bad_manual on bad input including a future asOf', async () => {
    const { send } = await setup();
    for (const body of [
      { ...amp, asOf: '2026-10-25' },
      { ...amp, asOf: '2026-02-30' },
      { ...amp, name: '' },
      { ...amp, name: 'x'.repeat(61) },
      { ...amp, icon: '123456789' },
      { ...amp, valueCents: 1.5 },
      { ...amp, valueCents: 2e12 },
      { ...amp, valueCents: '5' },
    ]) {
      const res = await send('POST', '/accounts/manual', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_manual' });
    }
    expect((await send('POST', '/accounts/manual', { ...amp, icon: null })).status).toBe(201);
  });

  it('PUT value: 404 unknown, 400 not_manual for PocketSmith', async () => {
    const { send, ps } = await setup();
    const body = { valueCents: 1, asOf: '2026-10-24' };
    expect((await send('PUT', '/accounts/999/value', body)).status).toBe(404);
    const res = await send('PUT', `/accounts/${ps}/value`, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'not_manual' });
  });

  it('DELETE removes a manual account, refuses PocketSmith', async () => {
    const { send, ps } = await setup();
    const a = (await (await send('POST', '/accounts/manual', amp)).json()) as Acct;
    expect((await send('DELETE', `/accounts/${a.id}`)).status).toBe(204);
    const list = (await (await send('GET', '/accounts')).json()) as { accounts: Acct[] };
    expect(list.accounts.some((x) => x.id === a.id)).toBe(false);
    const res = await send('DELETE', `/accounts/${ps}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'not_manual' });
    expect((await send('DELETE', '/accounts/999')).status).toBe(404);
  });

  it('GET holdings returns CoinSpot holdings by aud value descending', async () => {
    const { db, send } = await setup();
    const id = Number((await db.query<{ id: number }>("insert into account (source, external_id, institution, name, kind, counts_spending, counts_net_worth) values ('coinspot', 'coinspot', 'CoinSpot', 'CoinSpot', 'crypto', false, true) returning id"))[0]!.id);
    await db.query("insert into account_holding (account_id, symbol, units, aud_cents) values ($1, 'ETH', '1.5', 500000), ($1, 'BTC', '0.01', 900000)", [id]);
    const { holdings } = (await (await send('GET', `/accounts/${id}/holdings`)).json()) as { holdings: unknown[] };
    expect(holdings).toEqual([
      { symbol: 'BTC', units: '0.01', audCents: 900000 },
      { symbol: 'ETH', units: '1.5', audCents: 500000 },
    ]);
    expect((await send('GET', '/accounts/999/holdings')).status).toBe(404);
  });

  it('PUT value: 400 bad_manual on an invalid body or a future asOf, and nothing is written', async () => {
    const { send, db } = await setup();
    const a = (await (await send('POST', '/accounts/manual', amp)).json()) as Acct;
    for (const body of [{ valueCents: 1, asOf: '2026-10-25' }, { valueCents: 1.5, asOf: '2026-10-24' }, { asOf: '2026-10-24' }, [1]]) {
      const res = await send('PUT', `/accounts/${a.id}/value`, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_manual' });
    }
    expect(await db.query('select 1 from account_value where account_id = $1', [a.id])).toHaveLength(1);
  });

  it('setValue writes nothing for a non-manual account', async () => {
    const { db, ps } = await setup();
    expect(await makeManualRepo(db).setValue(ps, 5, '2026-10-24')).toBeNull();
    expect(await db.query('select 1 from account_value where account_id = $1', [ps])).toHaveLength(0);
  });
});
