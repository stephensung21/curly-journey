import { describe, expect, it } from 'vitest';
import type { TransactionRow } from '@curly/core';
import { createApp } from '../src/app';
import { makeRepo, type TransactionDto } from '../src/db/repo';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

async function setup() {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const repo = makeRepo(db);
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => new Date('2026-10-23T00:00:00Z') });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const bank = await repo.upsertAccount({ source: 'pocketsmith', externalId: '1', institution: 'CommBank', name: 'Everyday', kind: 'transaction', balanceCents: 0, balanceDate: '2026-10-22' });
  const cats = await repo.listCategories();
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  const add = async (externalId: string, description: string, amountCents = -500, merchant = '') => {
    const row: TransactionRow = {
      source: 'pocketsmith', externalId, accountExternalId: '1', date: '2026-10-05', amountCents, descriptionRaw: description,
      payee: description, status: 'posted', merchant, psCategory: null, memo: null, feedCreatedAt: '2026-10-20T01:00:00Z',
    };
    await repo.upsertFeedTransactions([{ accountId: bank, row }]);
    return Number((await db.query<{ id: number }>('select id from transaction where external_id = $1', [externalId]))[0]!.id);
  };
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body) });
  const get = async (id: number) => (await (await call('GET', `/transactions/${id}`)).json()) as TransactionDto;
  return { db, repo, call, add, get, cat, bank };
}

describe('rules', () => {
  it('preview excludes user-set rows and rows already in the category', async () => {
    const { db, call, add, repo, cat } = await setup();
    await add('1', 'Starbucks Sydney');
    const user = await add('2', 'STARBUCKS Pitt St');
    await add('3', 'Other', -500, 'starbucks');
    const done = await add('4', 'starbucks again');
    await add('5', 'Unrelated');
    await repo.patchTransaction(user, { categoryId: cat('Groceries') });
    await db.query("update transaction set category_id = $1, category_source = 'rule' where id = $2", [cat('Coffee'), done]);
    const n = async (q: string) => ((await (await call('GET', `/rules/preview?matchText=${q}`)).json()) as { matches: number }).matches;
    expect(await n('starbucks')).toBe(3);
    expect(await n(`starbucks&categoryId=${cat('Coffee')}`)).toBe(2);
    expect(await n('starbucks&amountCents=-999')).toBe(0);
    expect((await call('GET', '/rules/preview?matchText=ab')).status).toBe(400);
  });

  it('applyToPast false updates nothing; true updates matches but never the user-set row', async () => {
    const { call, add, get, repo, cat } = await setup();
    const a = await add('1', 'Starbucks Sydney');
    const b = await add('2', 'Starbucks Pitt');
    const user = await add('3', 'Starbucks George');
    await add('4', 'Unrelated');
    await repo.patchTransaction(user, { categoryId: cat('Groceries') });
    const body = { origin: 'user', matchText: '  starbucks ', categoryId: cat('Coffee') };

    const off = await call('POST', '/rules', { ...body, applyToPast: false });
    expect(off.status).toBe(201);
    expect(await off.json()).toMatchObject({ rule: { matchText: 'starbucks', origin: 'user', categoryId: cat('Coffee') }, updated: 0 });
    expect((await get(a)).categoryId).toBeNull();

    const on = await call('POST', '/rules', { ...body, origin: 'learned', applyToPast: true });
    expect(((await on.json()) as { updated: number }).updated).toBe(2);
    expect(await get(a)).toMatchObject({ categoryId: cat('Coffee'), categorySource: 'learned' });
    expect((await get(b)).categorySource).toBe('learned');
    expect(await get(user)).toMatchObject({ categoryId: cat('Groceries'), categorySource: 'user' });

    const user2 = await call('POST', '/rules', { ...body, applyToPast: true });
    expect(((await user2.json()) as { updated: number }).updated).toBe(2);
    expect((await get(a)).categorySource).toBe('rule');
  });

  it('a flow rule skips rows whose flow the owner set', async () => {
    const { call, add, get } = await setup();
    const a = await add('1', 'Payment to savings');
    const b = await add('2', 'Payment to savings');
    await call('PATCH', `/transactions/${b}`, { flow: 'normal' });
    const res = await call('POST', '/rules', { origin: 'user', matchText: 'savings', flow: 'not_spending', applyToPast: true });
    expect(((await res.json()) as { updated: number }).updated).toBe(2);
    expect(await get(a)).toMatchObject({ flow: 'not_spending', flowSource: 'rule' });
    expect(await get(b)).toMatchObject({ flow: 'normal', flowSource: 'user' });
  });

  it('lists with match counts, deletes without touching rows, and validates', async () => {
    const { call, add, get, cat } = await setup();
    const a = await add('1', 'Starbucks Sydney');
    await add('2', 'Starbucks Pitt');
    await add('3', 'Unrelated');
    const created = (await (await call('POST', '/rules', { origin: 'user', matchText: 'starbucks', categoryId: cat('Coffee'), applyToPast: true })).json()) as { rule: { id: number } };
    const list = (await (await call('GET', '/rules')).json()) as { rules: { id: number; matches: number }[] };
    expect(list.rules).toEqual([expect.objectContaining({ id: created.rule.id, matches: 2 })]);

    expect((await call('DELETE', `/rules/${created.rule.id}`)).status).toBe(204);
    expect((await call('DELETE', `/rules/${created.rule.id}`)).status).toBe(404);
    expect((await get(a)).categoryId).toBe(cat('Coffee'));

    const err = async (body: unknown) => ((await (await call('POST', '/rules', body)).json()) as { error: string }).error;
    expect(await err({ origin: 'user', matchText: 'ab', categoryId: 1, applyToPast: false })).toBe('bad_match_text');
    expect(await err({ origin: 'user', matchText: 'x'.repeat(61), categoryId: 1, applyToPast: false })).toBe('bad_match_text');
    expect(await err({ origin: 'user', matchText: 'abc', applyToPast: false })).toBe('bad_rule');
    expect(await err({ origin: 'user', matchText: 'abc', categoryId: 1 })).toBe('bad_rule');
    expect(await err({ origin: 'user', matchText: 'abc', categoryId: 99999, applyToPast: false })).toBe('bad_category');
  });
});
