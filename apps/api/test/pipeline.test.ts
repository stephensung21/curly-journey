import { describe, expect, it } from 'vitest';
import type { PsTransaction, PsTransactionAccount } from '@curly/core';
import { createApp, type Deps } from '../src/app';
import type { Db } from '../src/db/db';
import { makeRepo } from '../src/db/repo';
import { runPipeline } from '../src/spending/pipeline';
import { runSync } from '../src/sync/runSync';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

const acct = (id: number, type: string, name: string, institution: string): PsTransactionAccount => ({
  id, name, number: null, type, currency_code: 'aud',
  current_balance: 0, current_balance_date: '2026-10-22', institution: { id, title: institution },
});
const ACCOUNTS = [
  acct(1, 'bank', 'Everyday', 'CommBank'),
  acct(2, 'credits', 'Platinum', 'American Express'),
  acct(3, 'mortgage', 'Home Loan', 'CommBank'),
];
const tx = (id: number, accountId: number, date: string, amount: number, payee: string, over: Partial<PsTransaction> = {}): PsTransaction => ({
  id, payee, original_payee: null, date, amount, status: 'posted',
  updated_at: '2026-10-20T00:00:00Z', transaction_account: { id: accountId },
  category: null, memo: null, created_at: '2026-10-20T01:00:00Z', ...over,
});
const T0 = new Date('2026-10-23T00:00:00Z');

type Row = {
  external_id: string;
  category: string | null;
  category_source: string | null;
  initial_source: string | null;
  categorised: boolean;
  flow: string;
  flow_source: string;
  pair_id: string | null;
  id: string;
  note: string | null;
};

async function setup(transactions: Record<number, PsTransaction[]>) {
  const db = await pgliteDb();
  const data = { accounts: ACCOUNTS, transactions };
  const ps = fakePocketSmith(data);
  let now = T0.getTime();
  const deps = { db, pocketsmith: ps, now: () => new Date(now) };
  const tick = () => (now += 15 * 60_000);
  /** Runs syncs 15 minutes apart until history and the pipeline are done; returns the last result. */
  const syncAll = async (d: Deps = deps) => {
    for (let i = 0; ; i++) {
      const r = await runSync(d);
      tick();
      if (!r.more || i > 20) return r;
    }
  };
  const rows = async () => {
    const list = await db.query<Row>(
      `select t.id::text as id, t.external_id, c.name as category, t.category_source, t.initial_source, t.categorised,
              t.flow, t.flow_source, t.pair_id::text as pair_id, t.note
       from transaction t left join category c on c.id = t.category_id order by t.id`,
    );
    return new Map(list.map((r) => [r.external_id, r]));
  };
  return { db, data, deps, rows, syncAll };
}

describe('runPipeline after sync', () => {
  it('categorises a Woolworths row as Groceries from the merchant list', async () => {
    const { rows, syncAll } = await setup({ 1: [tx(1, 1, '2026-10-20', -84.2, 'WOOLWORTHS 1234 SYDNEY')] });
    expect(await syncAll()).toMatchObject({ status: 'ok', more: false });
    expect((await rows()).get('1')).toMatchObject({
      category: 'Groceries', category_source: 'merchant', initial_source: 'merchant', categorised: true, flow: 'normal',
    });
  });

  it('pairs a CommBank payment with the Amex payment received as transfers', async () => {
    const { rows, syncAll } = await setup({
      1: [tx(1, 1, '2026-10-10', -2530, 'AMEX CARD PAYMENT')],
      2: [tx(2, 2, '2026-10-11', 2530, 'PAYMENT RECEIVED - THANK YOU')],
    });
    await syncAll();
    const r = await rows();
    const out = r.get('1')!;
    const inn = r.get('2')!;
    expect(out).toMatchObject({ flow: 'transfer', flow_source: 'auto', pair_id: inn.id });
    expect(inn).toMatchObject({ flow: 'transfer', flow_source: 'auto', pair_id: out.id });
  });

  it('marks a payment into the mortgage account as mortgage', async () => {
    const { rows, syncAll } = await setup({
      1: [tx(1, 1, '2026-10-15', -3100, 'TRANSFER TO 0612')],
      3: [tx(2, 3, '2026-10-15', 3100, 'REPAYMENT')],
    });
    await syncAll();
    const r = await rows();
    expect(r.get('1')).toMatchObject({ flow: 'mortgage', pair_id: r.get('2')!.id });
    expect(r.get('2')).toMatchObject({ flow: 'transfer', pair_id: r.get('1')!.id });
  });

  it('never overwrites an owner-set category or flow, and never pairs with it', async () => {
    const { db, data, rows, syncAll } = await setup({ 1: [tx(1, 1, '2026-10-12', -500, 'KMART 123')] });
    await syncAll();
    const shopping = (await db.query<{ id: number }>("select id from category where name = 'Shopping'"))[0]!.id;
    const dining = (await db.query<{ id: number }>("select id from category where name = 'Dining out'"))[0]!.id;
    await db.query(
      `update transaction set category_id = $1, category_source = 'user', flow = 'not_spending', flow_source = 'user'
       where external_id = '1'`,
      [shopping],
    );
    // A rule that would match X if the pipeline ever looked at it again.
    await db.query(`insert into rule (origin, match_text, category_id) values ('user', 'KMART', $1)`, [dining]);
    data.transactions[2] = [tx(2, 2, '2026-10-12', 500, 'KMART 123 REFUND')];
    expect(await syncAll()).toMatchObject({ status: 'ok' });
    await db.query('update transaction set categorised = false');
    await runPipeline(makeRepo(db), { since: null });
    const r = await rows();
    expect(r.get('1')).toMatchObject({ category: 'Shopping', category_source: 'user', flow: 'not_spending', flow_source: 'user', pair_id: null });
    expect(r.get('2')).toMatchObject({ category: 'Dining out', category_source: 'rule', flow: 'normal', flow_source: 'auto', pair_id: null });
  });

  it("carries the owner's edits from a replaced pending row to the posted row", async () => {
    const { db, data, deps, rows, syncAll } = await setup({
      1: [tx(100, 1, '2026-10-20', -20, 'KMART 123', { status: 'pending' }), tx(5, 1, '2026-10-21', -20, 'KMART 123')],
    });
    await syncAll();
    const shopping = (await db.query<{ id: number }>("select id from category where name = 'Shopping'"))[0]!.id;
    await db.query(
      `update transaction set category_id = $1, category_source = 'user', flow = 'not_spending', flow_source = 'user',
         note = 'gift' where external_id = '100'`,
      [shopping],
    );
    data.transactions[1] = [tx(101, 1, '2026-10-20', -20, 'KMART 123'), tx(5, 1, '2026-10-21', -20, 'KMART 123')];
    expect(await runSync(deps)).toMatchObject({ status: 'ok', more: false });
    const r = await rows();
    expect(r.has('100')).toBe(false);
    expect(r.get('101')).toMatchObject({
      category: 'Shopping', category_source: 'user', flow: 'not_spending', flow_source: 'user', note: 'gift', categorised: true,
    });
    // Each carried edit lands on one row only: the closest date.
    expect(r.get('5')).toMatchObject({ category_source: 'merchant', flow_source: 'auto', note: null });
  });

  it('marks the sync failed and leaves rows uncategorised when the pipeline fails', async () => {
    const { db, deps, rows, syncAll } = await setup({ 1: [tx(1, 1, '2026-10-20', -84.2, 'WOOLWORTHS 1234 SYDNEY')] });
    const failing: Db = {
      query: (t, p) => (/from rule/.test(t) ? Promise.reject(new Error('rules unavailable')) : db.query(t, p)),
    };
    const r = await syncAll({ ...deps, db: failing });
    expect(r).toMatchObject({ status: 'failed', error: 'rules unavailable' });
    const log = await db.query<{ status: string; error: string }>('select status, error from sync_log order by id desc limit 1');
    expect(log[0]).toEqual({ status: 'failed', error: 'rules unavailable' });
    expect((await rows()).get('1')).toMatchObject({ categorised: false, category: null });
  });

  it('runs the pipeline only with at least 12 calls left, otherwise reports more', async () => {
    const { db, deps, rows, syncAll } = await setup({ 1: [tx(1, 1, '2026-10-20', -84.2, 'WOOLWORTHS 1234 SYDNEY')] });
    await syncAll();
    await db.query('update transaction set categorised = false');
    // Overhead 4, then reconcile (one page, its upsert, the delete) leaves 20 - 2 - 7 = 11 calls.
    expect(await runSync(deps, { maxCalls: 20 })).toMatchObject({ status: 'ok', more: true });
    expect((await rows()).get('1')).toMatchObject({ categorised: false });
    const log = await db.query<{ more: boolean }>('select more from sync_log order by id desc limit 1');
    expect(log[0]!.more).toBe(true);
    expect(await runSync({ ...deps, now: () => new Date(deps.now().getTime() + 15 * 60_000) }, { maxCalls: 21 })).toMatchObject({
      status: 'ok',
      more: false,
    });
    expect((await rows()).get('1')).toMatchObject({ categorised: true, category: 'Groceries' });
  });

  it("still carries the owner's edits when the pipeline is skipped, within the call budget", async () => {
    const { db, data, deps, rows, syncAll } = await setup({ 1: [tx(100, 1, '2026-10-20', -20, 'KMART 123', { status: 'pending' })] });
    await syncAll();
    const shopping = (await db.query<{ id: number }>("select id from category where name = 'Shopping'"))[0]!.id;
    await db.query(`update transaction set category_id = $1, category_source = 'user' where external_id = '100'`, [shopping]);
    data.transactions[1] = [tx(101, 1, '2026-10-20', -20, 'KMART 123 POSTED')];
    let calls = 0;
    const counting: Db = { query: (t, p) => (calls++, db.query(t, p)) };
    const psBefore = deps.pocketsmith.calls.length;
    expect(await runSync({ ...deps, db: counting }, { maxCalls: 20 })).toMatchObject({ status: 'ok', more: true });
    expect(calls + deps.pocketsmith.calls.length - psBefore).toBeLessThanOrEqual(20);
    expect((await rows()).get('101')).toMatchObject({ category: 'Shopping', category_source: 'user', categorised: false });
    await syncAll();
    expect((await rows()).get('101')).toMatchObject({ category: 'Shopping', category_source: 'user', categorised: true });
  });

  it("carries the owner's edits even when the pipeline fails before categorising", async () => {
    const { db, data, deps, rows, syncAll } = await setup({ 1: [tx(100, 1, '2026-10-20', -20, 'KMART 123', { status: 'pending' })] });
    await syncAll();
    const shopping = (await db.query<{ id: number }>("select id from category where name = 'Shopping'"))[0]!.id;
    await db.query(`update transaction set category_id = $1, category_source = 'user' where external_id = '100'`, [shopping]);
    data.transactions[1] = [tx(101, 1, '2026-10-20', -20, 'KMART 123 POSTED')];
    const failing: Db = {
      query: (t, p) => (/from rule/.test(t) ? Promise.reject(new Error('rules unavailable')) : db.query(t, p)),
    };
    expect(await runSync({ ...deps, db: failing })).toMatchObject({ status: 'failed' });
    expect((await rows()).get('101')).toMatchObject({ category: 'Shopping', category_source: 'user', categorised: false });
  });

  it("carries the owner's edits even when the history phase fails", async () => {
    const { db, data, deps, rows, syncAll } = await setup({ 1: [tx(100, 1, '2026-10-20', -20, 'KMART 123', { status: 'pending' })] });
    await syncAll();
    const shopping = (await db.query<{ id: number }>("select id from category where name = 'Shopping'"))[0]!.id;
    await db.query(`update transaction set category_id = $1, category_source = 'user' where external_id = '100'`, [shopping]);
    data.transactions[1] = [tx(101, 1, '2026-10-20', -20, 'KMART 123 POSTED')];
    // A new account needs history, and recording its first window fails.
    data.accounts = [...ACCOUNTS, acct(4, 'bank', 'Saver', 'CommBank')];
    const failing: Db = {
      query: (t, p) => (/set history_from/.test(t) ? Promise.reject(new Error('history write failed')) : db.query(t, p)),
    };
    expect(await runSync({ ...deps, db: failing })).toMatchObject({ status: 'failed', error: 'history write failed' });
    expect((await rows()).get('101')).toMatchObject({ category: 'Shopping', category_source: 'user' });
  });

  it("gives a carried edit only to a new row, never to an older categorised one", async () => {
    const { db, data, deps, rows, syncAll } = await setup({
      1: [tx(5, 1, '2026-10-20', -20, 'KMART 123'), tx(100, 1, '2026-10-20', -20, 'KMART 123', { status: 'pending' })],
    });
    await syncAll();
    const shopping = (await db.query<{ id: number }>("select id from category where name = 'Shopping'"))[0]!.id;
    await db.query(`update transaction set category_id = $1, category_source = 'user', note = 'gift' where external_id = '100'`, [shopping]);
    data.transactions[1] = [tx(5, 1, '2026-10-20', -20, 'KMART 123'), tx(101, 1, '2026-10-20', -20, 'KMART 123')];
    expect(await runSync(deps)).toMatchObject({ status: 'ok' });
    const r = await rows();
    expect(Number(r.get('5')!.id)).toBeLessThan(Number(r.get('101')!.id));
    expect(r.get('5')).toMatchObject({ category_source: 'merchant', note: null });
    expect(r.get('101')).toMatchObject({ category_source: 'user', note: 'gift' });
  });

  it('skips flow detection when the sync changed nothing and nothing needed categorising', async () => {
    const { db, deps, syncAll } = await setup({});
    await syncAll();
    const texts: string[] = [];
    const recording: Db = { query: (t, p) => (texts.push(t), db.query(t, p)) };
    expect(await runSync({ ...deps, db: recording })).toMatchObject({ status: 'ok', more: false, since: null });
    expect(texts.some((t) => t.includes('t.description_raw, t.flow, t.flow_source'))).toBe(false);
  });
});

describe('runPipeline', () => {
  it('also updates the older partner of a newly paired row', async () => {
    const { db, rows, syncAll } = await setup({ 1: [tx(1, 1, '2026-10-10', -2530, 'TRANSFER TO 3711')] });
    await syncAll();
    expect((await rows()).get('1')).toMatchObject({ flow: 'normal' });
    const amex = (await db.query<{ id: number }>("select id from account where kind = 'credit_card'"))[0]!.id;
    const repo = makeRepo(db);
    await repo.insertCsvRows(amex, [{ row: { date: '2026-10-11', amountCents: 253000, description: 'PAYMENT RECEIVED - THANK YOU' }, fingerprint: 'a1' }]);
    await runPipeline(repo, { since: '2026-10-11' });
    const r = await rows();
    expect(r.get('1')).toMatchObject({ flow: 'transfer', pair_id: r.get('a1')!.id });
    expect(r.get('a1')).toMatchObject({ flow: 'transfer', pair_id: r.get('1')!.id });
  });

  it('categorises at most 1000 rows per run, oldest first, in a fixed number of queries', async () => {
    const db = await pgliteDb();
    const repo = makeRepo(db);
    const a = await repo.upsertAccount({ source: 'pocketsmith', externalId: 'm1', institution: 'CBA', name: 'Everyday', kind: 'transaction', balanceCents: 0, balanceDate: '2026-10-22' });
    const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + Math.floor(i / 4))).toISOString().slice(0, 10);
    await repo.insertCsvRows(
      a,
      Array.from({ length: 1001 }, (_, i) => ({ row: { date: day(i), amountCents: -100 - i, description: 'WOOLWORTHS' }, fingerprint: `f${i}` })),
    );
    let calls = 0;
    const counting: Db = { query: (t, p) => (calls++, db.query(t, p)) };
    expect(await runPipeline(makeRepo(counting), { since: null })).toMatchObject({ categorised: 1000, more: true });
    expect(calls).toBeLessThanOrEqual(8);
    const left = await db.query<{ amount_cents: string }>('select amount_cents::text from transaction where not categorised');
    expect(left).toEqual([{ amount_cents: '-1100' }]);
    expect(await runPipeline(repo, { since: null })).toMatchObject({ categorised: 1, more: false });
  });
});

describe('imports', () => {
  it('commit categorises the imported rows', async () => {
    const db = await pgliteDb();
    const token = await seedToken(db);
    const repo = makeRepo(db);
    const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => T0 });
    const accountId = await repo.upsertAccount({ source: 'pocketsmith', externalId: '1', institution: 'CBA', name: 'Everyday', kind: 'transaction', balanceCents: 0, balanceDate: '2026-10-22' });
    const csv = '22/10/2026,"-84.20","WOOLWORTHS 1234 SYDNEY AU Card xx1234","+6,240.00"\n20/10/2026,"+4,700.00","SALARY ACME PTY LTD","+6,333.20"\n';
    const res = await app.request('/imports/commit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, format: 'commbank', csv }),
    });
    expect(await res.json()).toEqual({ inserted: 2 });
    const rows = await db.query<{ description_raw: string; name: string; category_source: string; categorised: boolean }>(
      `select t.description_raw, c.name, t.category_source, t.categorised
       from transaction t join category c on c.id = t.category_id order by t.date`,
    );
    expect(rows).toEqual([
      { description_raw: 'SALARY ACME PTY LTD', name: 'Income', category_source: 'default', categorised: true },
      { description_raw: 'WOOLWORTHS 1234 SYDNEY AU Card xx1234', name: 'Groceries', category_source: 'merchant', categorised: true },
    ]);
  });
});
