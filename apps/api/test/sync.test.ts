import { describe, expect, it } from 'vitest';
import type { PsTransaction, PsTransactionAccount } from '@curly/core';
import { createApp } from '../src/app';
import { makeRepo } from '../src/db/repo';
import { runSync } from '../src/sync/runSync';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

const acct = (id: number, bal: number): PsTransactionAccount => ({
  id, name: `Acct ${id}`, number: null, type: 'bank', currency_code: 'aud',
  current_balance: bal, current_balance_date: '2026-10-22', institution: { id: 1, title: 'Bank' },
});
const tx = (id: number, accountId: number): PsTransaction => ({
  id, payee: `P${id}`, original_payee: null, date: '2026-10-20', amount: -10, status: 'posted',
  updated_at: '2026-10-20T00:00:00Z', transaction_account: { id: accountId },
});
const T0 = new Date('2026-10-23T00:00:00Z');

async function setup(ps = fakePocketSmith({ accounts: [acct(1, 10), acct(2, 20)], transactions: { 1: [tx(1, 1), tx(2, 1)], 2: [tx(3, 2)] } }), now = T0) {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const deps = { db, pocketsmith: ps, now: () => now };
  return { db, deps, app: createApp(deps), auth: { Authorization: `Bearer ${token}` } };
}

describe('runSync', () => {
  it('full sync', async () => {
    const { deps, app, auth } = await setup();
    expect(await runSync(deps)).toEqual({ status: 'ok', accounts: 2, transactions: 3 });
    const res = await app.request('/accounts', { headers: auth });
    expect(((await res.json()) as unknown[]).length).toBe(2);
  });

  it('incremental uses last start minus 1h', async () => {
    const ps = fakePocketSmith({ accounts: [acct(1, 10)] });
    const { db } = await setup(ps);
    let now = T0;
    const deps = { db, pocketsmith: ps, now: () => now };
    await runSync(deps);
    expect(ps.calls).toContain('transactions:1:');
    now = new Date('2026-10-23T04:00:00Z');
    await runSync(deps);
    expect(ps.calls).toContain(`transactions:1:${new Date('2026-10-22T23:00:00Z').toISOString()}`);
  });

  it('failure keeps earlier upserts and lastSuccessfulSync', async () => {
    const good = fakePocketSmith({ accounts: [acct(1, 10), acct(2, 20)] });
    const { db } = await setup(good);
    await runSync({ db, pocketsmith: good, now: () => T0 });
    const before = await makeRepo(db).lastSuccessfulSync();
    const bad = fakePocketSmith({ accounts: [acct(1, 99), acct(2, 20)], failOnAccount: 2 });
    const r = await runSync({ db, pocketsmith: bad, now: () => new Date('2026-10-23T04:00:00Z') });
    expect(r.status).toBe('failed');
    expect(r.error).toContain('account 2');
    const log = await db.query<{ status: string; error: string }>('select status, error from sync_log order by id desc limit 1');
    expect(log[0]!.status).toBe('failed');
    expect(log[0]!.error).toContain('account 2');
    const accts = await makeRepo(db).listAccounts();
    expect(accts.find((a) => a.balanceCents === 9900)).toBeTruthy();
    expect(await makeRepo(db).lastSuccessfulSync()).toEqual(before);
  });

  it('overlap gives 409 and fake never called', async () => {
    const ps = fakePocketSmith({ accounts: [acct(1, 10)] });
    const { db, app, auth } = await setup(ps);
    await makeRepo(db).startSync(new Date(T0.getTime() - 60_000));
    const res = await app.request('/sync', { method: 'POST', headers: auth });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'sync_in_progress' });
    expect(ps.calls).toEqual([]);
  });

  it('POST /sync 502 on failure without message', async () => {
    const ps = fakePocketSmith({ accounts: [acct(1, 10)], failOnAccount: 1 });
    const { app, auth } = await setup(ps);
    const res = await app.request('/sync', { method: 'POST', headers: auth });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'sync_failed' });
  });

  it('POST /sync 200 body', async () => {
    const { app, auth } = await setup();
    const res = await app.request('/sync', { method: 'POST', headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', accounts: 2, transactions: 3 });
  });

  it('status stale when never synced, fresh after', async () => {
    const { app, auth } = await setup();
    const s = await (await app.request('/sync/status', { headers: auth })).json();
    expect(s).toEqual({ lastSuccessAt: null, lastStatus: null, stale: true });
    await app.request('/sync', { method: 'POST', headers: auth });
    const s2 = (await (await app.request('/sync/status', { headers: auth })).json()) as { stale: boolean; lastStatus: string; lastSuccessAt: string };
    expect(s2.stale).toBe(false);
    expect(s2.lastStatus).toBe('ok');
    expect(s2.lastSuccessAt).toBe(T0.toISOString());
  });
});
