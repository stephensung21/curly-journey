import { describe, expect, it } from 'vitest';
import type { PsTransaction, PsTransactionAccount } from '@curly/core';
import { createApp } from '../src/app';
import { makeRepo } from '../src/db/repo';
import { runSync, syncDue } from '../src/sync/runSync';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

const acct = (id: number, bal: number): PsTransactionAccount => ({
  id, name: `Acct ${id}`, number: null, type: 'bank', currency_code: 'aud',
  current_balance: bal, current_balance_date: '2026-10-22', institution: { id: 1, title: 'Bank' },
});
const tx = (id: number, accountId: number, date = '2026-10-20', over: Partial<PsTransaction> = {}): PsTransaction => ({
  id, payee: `P${id}`, original_payee: null, date, amount: -10, status: 'posted',
  updated_at: '2026-10-20T00:00:00Z', transaction_account: { id: accountId },
  category: null, memo: null, created_at: '2026-10-20T01:00:00Z', ...over,
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
    expect(await runSync(deps)).toEqual({ status: 'ok', accounts: 2, transactions: 3, more: false, since: '2026-10-20' });
    const res = await app.request('/accounts', { headers: auth });
    expect(((await res.json()) as { accounts: unknown[] }).accounts.length).toBe(2);
  });

  it('first sync fetches history in 90-day windows back 400 days, newest first', async () => {
    const ps = fakePocketSmith({ accounts: [acct(1, 10)] });
    const { db } = await setup(ps);
    await runSync({ db, pocketsmith: ps, now: () => T0 });
    expect(ps.calls.filter((c) => c.startsWith('transactions:1:'))).toEqual([
      'transactions:1::2026-07-26:2026-10-23:1',
      'transactions:1::2026-04-27:2026-07-25:1',
      'transactions:1::2026-01-27:2026-04-26:1',
      'transactions:1::2025-10-29:2026-01-26:1',
      'transactions:1::2025-07-31:2025-10-28:1',
    ]);
  });

  it('loads the newest window of every account before older history', async () => {
    const ps = fakePocketSmith({ accounts: [acct(1, 1), acct(2, 2), acct(3, 3)] });
    const { db } = await setup(ps);
    // Overhead 4 (one query upserts every account), then 2 calls per empty window: room for 4 windows.
    const r = await runSync({ db, pocketsmith: ps, now: () => T0 }, { maxCalls: 15 });
    expect(r.more).toBe(true);
    expect(ps.calls.filter((c) => c.startsWith('transactions:'))).toEqual([
      'transactions:1::2026-07-26:2026-10-23:1',
      'transactions:2::2026-07-26:2026-10-23:1',
      'transactions:3::2026-07-26:2026-10-23:1',
      'transactions:1::2026-04-27:2026-07-25:1',
    ]);
  });

  it('reconciles the last 14 days of every account whose history has started', async () => {
    const ps = fakePocketSmith({ accounts: [acct(1, 10)] });
    const { db } = await setup(ps);
    let now = T0;
    const deps = { db, pocketsmith: ps, now: () => now };
    await runSync(deps);
    expect(ps.calls).not.toContain('transactions:1::2026-10-09:2026-10-23:1');
    now = new Date('2026-10-23T04:00:00Z');
    ps.calls.length = 0;
    await runSync(deps);
    expect(ps.calls.filter((c) => c.startsWith('transactions:'))[0]).toBe('transactions:1::2026-10-09:2026-10-23:1');
    expect(ps.calls.some((c) => /^transactions:1:[^:]/.test(c))).toBe(false);
  });

  it('replaces a pending row that posts under a new ID', async () => {
    const data = { accounts: [acct(1, 10)], transactions: { 1: [tx(100, 1, '2026-10-20', { amount: -20, status: 'pending' })] } };
    const ps = fakePocketSmith(data);
    const { db } = await setup(ps);
    let now = T0;
    const deps = { db, pocketsmith: ps, now: () => now };
    await runSync(deps);
    data.transactions[1] = [tx(101, 1, '2026-10-20', { amount: -20, status: 'posted' })];
    now = new Date('2026-10-23T04:00:00Z');
    const r = await runSync(deps);
    expect(r).toMatchObject({ status: 'ok', since: '2026-10-20' });
    const rows = await db.query<{ external_id: string; status: string }>('select external_id, status from transaction');
    expect(rows).toEqual([{ external_id: '101', status: 'posted' }]);
  });

  it('keeps feed rows older than the window and CSV rows inside it', async () => {
    const data = { accounts: [acct(1, 10)], transactions: { 1: [tx(1, 1, '2026-09-23'), tx(2, 1, '2026-10-20')] } };
    const ps = fakePocketSmith(data);
    const { db } = await setup(ps);
    let now = T0;
    const deps = { db, pocketsmith: ps, now: () => now };
    await runSync(deps);
    const [a] = await makeRepo(db).listAccounts();
    await makeRepo(db).insertCsvRows(a!.id, [{ row: { date: '2026-10-21', amountCents: -5, description: 'CSV ROW' }, fingerprint: 'c1' }]);
    data.transactions[1] = [];
    now = new Date('2026-10-23T04:00:00Z');
    await runSync(deps);
    const rows = await db.query<{ external_id: string }>('select external_id from transaction order by external_id');
    expect(rows.map((r) => r.external_id)).toEqual(['1', 'c1']);
  });

  it('stores merchant, PocketSmith category, memo and feed time, and never touches the category', async () => {
    const data = {
      accounts: [acct(1, 10)],
      transactions: {
        1: [tx(1, 1, '2026-10-20', { payee: 'WOOLWORTHS 1234 SYDNEY', category: { title: 'Groceries' }, memo: 'weekly shop', created_at: '2026-10-20T03:04:05Z' })],
      },
    };
    const ps = fakePocketSmith(data);
    const { db } = await setup(ps);
    let now = T0;
    const deps = { db, pocketsmith: ps, now: () => now };
    await runSync(deps);
    const q = () =>
      db.query<{ merchant: string; ps_category: string | null; memo: string | null; feed: string; category_id: number | null }>(
        `select merchant, ps_category, memo, to_char(feed_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as feed, category_id from transaction`,
      );
    expect(await q()).toEqual([{ merchant: 'Woolworths', ps_category: 'Groceries', memo: 'weekly shop', feed: '2026-10-20T03:04:05', category_id: null }]);
    const cat = await db.query<{ id: number }>("select id from category where name = 'Dining out'");
    await db.query('update transaction set category_id = $1', [cat[0]!.id]);
    data.transactions[1] = [tx(1, 1, '2026-10-20', { payee: 'WOOLWORTHS 1234 SYDNEY', category: { title: 'Shopping' }, memo: 'edited' })];
    now = new Date('2026-10-23T04:00:00Z');
    await runSync(deps);
    expect(await q()).toEqual([{ merchant: 'Woolworths', ps_category: 'Shopping', memo: 'edited', feed: '2026-10-20T03:04:05', category_id: cat[0]!.id }]);
  });

  it('spreads a long history over several runs, each within the call budget', async () => {
    // 3 accounts, one transaction a week for 400 days, 5 per page: far more than one run's budget.
    const days = Array.from({ length: 58 }, (_, i) => new Date(Date.UTC(2026, 9, 22 - i * 7)).toISOString().slice(0, 10));
    const txs: Record<number, PsTransaction[]> = {};
    let n = 0;
    for (const a of [1, 2, 3]) txs[a] = days.map((d) => tx(++n, a, d));
    const ps = fakePocketSmith({ accounts: [acct(1, 1), acct(2, 2), acct(3, 3)], transactions: txs, pageSize: 5 });
    const db = await pgliteDb();
    let dbCalls = 0;
    const counting = {
      query: (t: string, p?: unknown[]) => {
        dbCalls++;
        return db.query(t, p);
      },
    } as typeof db;
    let now = T0.getTime();
    const results = [];
    for (let i = 0; i < 30; i++) {
      dbCalls = 0;
      const psBefore = ps.calls.length;
      const r = await runSync({ db: counting, pocketsmith: ps, now: () => new Date(now) }, { maxCalls: 30 });
      expect(dbCalls + ps.calls.length - psBefore).toBeLessThanOrEqual(30);
      results.push(r);
      now += 15 * 60_000;
      if (!r.more) break;
    }
    expect(results[0]!.more).toBe(true);
    expect(results.at(-1)).toMatchObject({ status: 'ok', more: false });
    const rows = await db.query<{ n: string }>('select count(*)::text as n from transaction');
    expect(Number(rows[0]!.n)).toBe(3 * 58);
    const hist = await db.query<{ history_done: boolean }>('select history_done from account');
    expect(hist.every((h) => h.history_done)).toBe(true);
  });

  it('fails when the budget runs out mid-reconcile', async () => {
    const ps = fakePocketSmith({ accounts: [acct(1, 1), acct(2, 2)] });
    const { db } = await setup(ps);
    await runSync({ db, pocketsmith: ps, now: () => T0 });
    const before = await makeRepo(db).lastSuccessfulSync();
    const r = await runSync({ db, pocketsmith: ps, now: () => new Date('2026-10-23T04:00:00Z') }, { maxCalls: 9 });
    expect(r.status).toBe('failed');
    expect(await makeRepo(db).lastSuccessfulSync()).toEqual(before);
    const log = await db.query<{ status: string }>('select status from sync_log order by id desc limit 1');
    expect(log[0]!.status).toBe('failed');
  });

  it('fails on a pagination loop instead of spinning', async () => {
    const ps = fakePocketSmith({ accounts: [acct(1, 1)], loopOnAccount: 1 });
    const { db } = await setup(ps);
    const r = await runSync({ db, pocketsmith: ps, now: () => T0 });
    expect(r.status).toBe('failed');
    expect(ps.calls.filter((c) => c.startsWith('transactions:')).length).toBeLessThanOrEqual(3);
  });

  it('syncDue: never synced, history still loading, or last success 3h50m ago', async () => {
    const ps = fakePocketSmith({ accounts: [acct(1, 1)] });
    const { db } = await setup(ps);
    expect(await syncDue(db, T0)).toBe(true);
    await runSync({ db, pocketsmith: ps, now: () => T0 });
    expect(await syncDue(db, new Date(T0.getTime() + 15 * 60_000))).toBe(false);
    expect(await syncDue(db, new Date(T0.getTime() + 230 * 60_000))).toBe(true);
    await db.query("update sync_log set more = true where status = 'ok'");
    expect(await syncDue(db, new Date(T0.getTime() + 15 * 60_000))).toBe(true);
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
    expect(await res.json()).toEqual({ status: 'ok', accounts: 2, transactions: 3, more: false });
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
