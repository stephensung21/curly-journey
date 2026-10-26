import { describe, expect, it } from 'vitest';
import type { TransactionRow } from '@curly/core';
import { createApp } from '../src/app';
import { makeRepo, type TransactionDto } from '../src/db/repo';
import { runPipeline } from '../src/spending/pipeline';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

const T0 = new Date('2026-10-23T00:00:00Z');

async function setup() {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const repo = makeRepo(db);
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => T0 });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const bank = await repo.upsertAccount({ source: 'pocketsmith', externalId: '1', institution: 'CommBank', name: 'Everyday', kind: 'transaction', balanceCents: 0, balanceDate: '2026-10-22' });
  const amex = await repo.upsertAccount({ source: 'pocketsmith', externalId: '2', institution: 'American Express', name: 'Platinum', kind: 'credit_card', balanceCents: 0, balanceDate: '2026-10-22' });
  const cats = await repo.listCategories();
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  const row = (externalId: string, date: string, amountCents: number, descriptionRaw: string, merchant = ''): TransactionRow => ({
    source: 'pocketsmith', externalId, accountExternalId: '1', date, amountCents, descriptionRaw, payee: descriptionRaw,
    status: 'posted', merchant, psCategory: null, memo: 'a memo', feedCreatedAt: '2026-10-20T01:02:03Z',
  });
  const add = async (accountId: number, r: TransactionRow) => {
    await repo.upsertFeedTransactions([{ accountId, row: r }]);
    return Number((await db.query<{ id: number }>('select id from transaction where external_id = $1', [r.externalId]))[0]!.id);
  };
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body) });
  return { db, repo, app, auth, bank, amex, cat, row, add, call };
}

describe('auth', () => {
  it('401s every new route without a token', async () => {
    const { app } = await setup();
    const routes: [string, string][] = [
      ['GET', '/categories'], ['POST', '/categories'], ['GET', '/transactions?month=2026-10'], ['GET', '/transactions/1'],
      ['PATCH', '/transactions/1'], ['PUT', '/transactions/1/splits'], ['GET', '/rules'], ['GET', '/rules/preview?matchText=abc'],
      ['POST', '/rules'], ['DELETE', '/rules/1'],
    ];
    for (const [method, path] of routes) expect((await app.request(path, { method })).status, `${method} ${path}`).toBe(401);
  });
});

describe('categories', () => {
  it('lists by sort, creates with sort = max + 1, 409 on duplicate, 400 on bad input', async () => {
    const { call } = await setup();
    const list = (await (await call('GET', '/categories')).json()) as { categories: { name: string; sort: number }[] };
    expect(list.categories[0]!.name).toBe('Groceries');
    const max = Math.max(...list.categories.map((c) => c.sort));
    const res = await call('POST', '/categories', { name: ' Hobbies ', emoji: '🎨', color: 'pink', kind: 'spending' });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ name: 'Hobbies', emoji: '🎨', color: 'pink', kind: 'spending', sort: max + 1 });
    expect((await call('POST', '/categories', { name: 'Hobbies', emoji: '🎨', color: 'pink', kind: 'spending' })).status).toBe(409);
    for (const bad of [{ name: '', emoji: 'x', color: 'pink', kind: 'spending' }, { name: 'a'.repeat(41), emoji: 'x', color: 'pink', kind: 'spending' },
      { name: 'N', emoji: '', color: 'pink', kind: 'spending' }, { name: 'N', emoji: 'x', color: 'red', kind: 'spending' }, { name: 'N', emoji: 'x', color: 'pink', kind: 'other' }]) {
      const r = await call('POST', '/categories', bad);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'bad_category' });
    }
  });

  it('PUT /categories/order reorders; unlisted categories keep their order after the listed ones', async () => {
    const { call } = await setup();
    const ids = async () => ((await (await call('GET', '/categories')).json()) as { categories: { id: number; sort: number }[] }).categories;
    const before = await ids();
    const [a, b, ...rest] = before.map((c) => c.id);
    const res = await call('PUT', '/categories/order', { ids: [b, a] });
    expect(res.status).toBe(200);
    const after = await ids();
    expect(after.map((c) => c.id)).toEqual([b, a, ...rest]);
    expect(after.map((c) => c.sort)).toEqual(after.map((_, i) => i + 1));
    expect((await (await call('POST', '/categories', { name: 'Dates', emoji: '💕', color: 'pink', kind: 'spending' })).json()) as { sort: number })
      .toMatchObject({ sort: after.length + 1 });
  });

  it('PUT /categories/order 400s on bad shapes, duplicates and unknown ids, and 401s without a token', async () => {
    const { call, app } = await setup();
    const first = ((await (await call('GET', '/categories')).json()) as { categories: { id: number }[] }).categories[0]!.id;
    for (const body of [{ ids: [first, first] }, { ids: [first, 99999] }, { ids: [1.5] }, { ids: [0] }, { ids: ['1'] }, { ids: [] }, { ids: 'x' }, {}, []]) {
      const r = await call('PUT', '/categories/order', body);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'bad_order' });
    }
    expect((await app.request('/categories/order', { method: 'PUT', body: '{"ids":[1]}' })).status).toBe(401);
  });
});

describe('GET /transactions', () => {
  it('returns the full dto, filters by categoryId=none, institution and statement period', async () => {
    const { call, add, row, bank, amex, cat, repo } = await setup();
    const a = await add(bank, row('a', '2026-10-05', -1000, 'WOOLWORTHS'));
    await add(bank, row('b', '2026-09-30', -500, 'COLES'));
    await add(amex, { ...row('c', '2026-09-26', -700, 'CAFE'), accountExternalId: '2' });
    await add(amex, { ...row('d', '2026-10-26', -800, 'LATE'), accountExternalId: '2' });
    await repo.patchTransaction(a, { categoryId: cat('Groceries') });

    const oct = (await (await call('GET', '/transactions?month=2026-10')).json()) as { transactions: TransactionDto[] };
    expect(oct.transactions.map((t) => t.description)).toEqual(['LATE', 'WOOLWORTHS']);
    expect(oct.transactions[1]).toMatchObject({
      accountId: bank, categoryId: cat('Groceries'), categorySource: 'user', flow: 'normal', flowSource: 'auto', memo: 'a memo',
      feedCreatedAt: '2026-10-20T01:02:03.000Z', splits: [], note: null,
    });

    const none = (await (await call('GET', '/transactions?month=2026-10&categoryId=none')).json()) as { transactions: TransactionDto[] };
    expect(none.transactions.map((t) => t.description)).toEqual(['LATE']);

    const inst = (await (await call('GET', '/transactions?month=2026-10&institution=Amex')).json()) as { transactions: TransactionDto[] };
    expect(inst.transactions.map((t) => t.description)).toEqual(['LATE']);

    const stmt = (await (await call('GET', `/transactions?month=2026-10&period=statement&accountId=${amex}`)).json()) as { transactions: TransactionDto[] };
    expect(stmt.transactions.map((t) => t.description)).toEqual(['CAFE']);

    const noAcct = await call('GET', '/transactions?month=2026-10&period=statement');
    expect(noAcct.status).toBe(400);
    expect(await noAcct.json()).toEqual({ error: 'bad_period' });
    expect((await call('GET', '/transactions?month=nope')).status).toBe(400);
  });

  it('without an account, lists every flow in accounts that count towards spending (Spending tab list)', async () => {
    const { call, add, row, bank, repo } = await setup();
    const loan = await repo.upsertAccount({ source: 'pocketsmith', externalId: '9', institution: 'CommBank', name: 'Home loan', kind: 'mortgage', balanceCents: 0, balanceDate: '2026-10-22' });
    const pay = await add(bank, row('p', '2026-10-03', 500000, 'SALARY'));
    await add(bank, row('a', '2026-10-05', -1000, 'WOOLWORTHS'));
    await add(loan, { ...row('l', '2026-10-28', -300000, 'LOAN REPAYMENT'), accountExternalId: '9' });
    await repo.patchTransaction(pay, { flow: 'not_spending' });

    const all = (await (await call('GET', '/transactions?month=2026-10')).json()) as { transactions: TransactionDto[] };
    expect(all.transactions.map((t) => t.description)).toEqual(['WOOLWORTHS', 'SALARY']);
    const inst = (await (await call('GET', '/transactions?month=2026-10&institution=CommBank')).json()) as { transactions: TransactionDto[] };
    expect(inst.transactions.map((t) => t.description)).toEqual(['WOOLWORTHS', 'SALARY']);
    const loanOnly = (await (await call('GET', `/transactions?month=2026-10&accountId=${loan}`)).json()) as { transactions: TransactionDto[] };
    expect(loanOnly.transactions.map((t) => t.description)).toEqual(['LOAN REPAYMENT']);
  });

  it('GET /accounts/:id/transactions returns the same dto', async () => {
    const { call, add, row, bank } = await setup();
    await add(bank, row('a', '2026-10-05', -1000, 'WOOLWORTHS'));
    const res = (await (await call('GET', `/accounts/${bank}/transactions?month=2026-10`)).json()) as { transactions: TransactionDto[] };
    expect(res.transactions[0]).toMatchObject({ accountId: bank, flow: 'normal', splits: [] });
  });
});

describe('PATCH /transactions/:id', () => {
  it('keeps a user category through re-sync', async () => {
    const { call, add, row, bank, cat, repo } = await setup();
    const id = await add(bank, row('a', '2026-10-05', -1000, 'WOOLWORTHS'));
    const res = await call('PATCH', `/transactions/${id}`, { categoryId: cat('Coffee'), note: 'flat white' });
    expect(await res.json()).toMatchObject({ categoryId: cat('Coffee'), categorySource: 'user', note: 'flat white' });
    await repo.upsertFeedTransactions([{ accountId: bank, row: row('a', '2026-10-05', -1000, 'WOOLWORTHS') }]);
    const again = (await (await call('GET', `/transactions/${id}`)).json()) as TransactionDto;
    expect(again).toMatchObject({ categoryId: cat('Coffee'), categorySource: 'user' });
  });

  it('keeps a user flow through the pipeline', async () => {
    const { call, add, row, bank, repo } = await setup();
    const id = await add(bank, row('a', '2026-10-05', -1000, 'WOOLWORTHS'));
    const res = await call('PATCH', `/transactions/${id}`, { flow: 'not_spending' });
    expect(await res.json()).toMatchObject({ flow: 'not_spending', flowSource: 'user' });
    await runPipeline(repo, { since: null, now: T0 });
    expect(await (await call('GET', `/transactions/${id}`)).json()).toMatchObject({ flow: 'not_spending', flowSource: 'user' });
  });

  async function pair(ctx: Awaited<ReturnType<typeof setup>>) {
    const { add, row, bank, amex, repo, db } = ctx;
    const a = await add(bank, row('pa', '2026-10-10', -5000, 'AMEX CARD PAYMENT'));
    const b = await add(amex, { ...row('pb', '2026-10-11', 5000, 'PAYMENT RECEIVED - THANK YOU'), accountExternalId: '2' });
    await runPipeline(repo, { since: '2026-10-01', now: T0 });
    const get = async (id: number) =>
      (await db.query<{ flow: string; flow_source: string; pair_id: number | null; categorised: boolean }>(
        'select flow, flow_source, pair_id, categorised from transaction where id = $1', [id]))[0]!;
    return { a, b, get };
  }

  it('changes both halves of a transfer together and keeps them linked', async () => {
    const ctx = await setup();
    const { a, b, get } = await pair(ctx);
    expect(await get(a)).toMatchObject({ flow: 'transfer', pair_id: b });
    await ctx.call('PATCH', `/transactions/${a}`, { flow: 'normal' });
    expect(await get(a)).toMatchObject({ flow: 'normal', flow_source: 'user', pair_id: b });
    expect(await get(b)).toMatchObject({ flow: 'normal', flow_source: 'user', pair_id: a });
    await ctx.call('PATCH', `/transactions/${b}`, { flow: 'transfer' });
    expect(await get(a)).toMatchObject({ flow: 'transfer', flow_source: 'user' });
    expect(await get(b)).toMatchObject({ flow: 'transfer', flow_source: 'user' });
  });

  it('a pipeline run after the change leaves both halves as the owner set them', async () => {
    const ctx = await setup();
    const { a, b, get } = await pair(ctx);
    await ctx.call('PATCH', `/transactions/${a}`, { flow: 'not_spending' });
    await runPipeline(ctx.repo, { since: '2026-10-01', now: T0 });
    expect(await get(a)).toMatchObject({ flow: 'not_spending', flow_source: 'user' });
    expect(await get(b)).toMatchObject({ flow: 'not_spending', flow_source: 'user' });
  });

  it('validates and 404s', async () => {
    const { call, add, row, bank } = await setup();
    const id = await add(bank, row('a', '2026-10-05', -1000, 'X'));
    const err = async (body: unknown) => ((await (await call('PATCH', `/transactions/${id}`, body)).json()) as { error: string }).error;
    expect(await err({ categoryId: 99999 })).toBe('bad_category');
    expect(await err({ flow: 'weird' })).toBe('bad_flow');
    expect(await err({ note: 'n'.repeat(501) })).toBe('bad_note');
    expect(await err({ other: 1 })).toBe('bad_patch');
    expect((await call('PATCH', `/transactions/${id}`, { categoryId: null, note: null })).status).toBe(200);
    expect((await call('PATCH', '/transactions/99999', { note: 'x' })).status).toBe(404);
    expect((await call('GET', '/transactions/99999')).status).toBe(404);
  });
});

describe('PUT /transactions/:id/splits', () => {
  it('rejects bad totals, sign and count; stores, returns and clears good splits', async () => {
    const { call, add, row, bank, cat, db } = await setup();
    const id = await add(bank, row('a', '2026-10-05', -1000, 'COSTCO'));
    const put = (splits: unknown) => call('PUT', `/transactions/${id}/splits`, { splits });
    const g = cat('Groceries');
    const h = cat('Home');

    const total = await put([{ categoryId: g, amountCents: -600 }, { categoryId: h, amountCents: -300 }]);
    expect(total.status).toBe(400);
    expect(await total.json()).toEqual({ error: 'bad_split_total' });
    for (const bad of [[{ categoryId: g, amountCents: -1000 }], [{ categoryId: g, amountCents: 1500 }, { categoryId: h, amountCents: -500 }],
      [{ categoryId: g, amountCents: 0 }, { categoryId: h, amountCents: -1000 }]]) {
      expect(await (await put(bad)).json()).toEqual({ error: 'bad_split' });
    }
    expect(await (await put([{ categoryId: 99999, amountCents: -600 }, { categoryId: h, amountCents: -400 }])).json()).toEqual({ error: 'bad_category' });

    const ok = await put([{ categoryId: g, amountCents: -600 }, { categoryId: h, amountCents: -400 }]);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as TransactionDto).splits).toEqual([{ categoryId: g, amountCents: -600 }, { categoryId: h, amountCents: -400 }]);

    const cleared = (await (await put([])).json()) as TransactionDto;
    expect(cleared.splits).toEqual([]);
    // The write is one statement: the existence check, delete and insert together, then the row is read back.
    let calls = 0;
    const counting = makeRepo({ query: (t, p) => (calls++, db.query(t, p)) });
    expect((await counting.setSplits(id, [{ categoryId: g, amountCents: -600 }, { categoryId: h, amountCents: -400 }]))!.splits).toHaveLength(2);
    expect(calls).toBe(3);
    calls = 0;
    expect(await counting.setSplits(99999, [])).toBeNull();
    expect(calls).toBe(1);
    await counting.setSplits(id, []);
    expect(cleared.splits).toEqual([]);
    expect((await call('PUT', '/transactions/99999/splits', { splits: [] })).status).toBe(404);
  });
});
