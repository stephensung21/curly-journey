import { describe, expect, it } from 'vitest';
import type { TransactionRow } from '@curly/core';
import { createApp } from '../src/app';
import { makeRepo } from '../src/db/repo';
import { categoryIdByName } from '../src/spending/categoryNames';
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
  await db.query('update account set history_done = true');
  const cats = await repo.listCategories();
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  const row = (externalId: string, amountCents: number, descriptionRaw: string, psCategory: string | null = null): TransactionRow => ({
    source: 'pocketsmith', externalId, accountExternalId: '1', date: '2026-10-20', amountCents, descriptionRaw, payee: descriptionRaw,
    status: 'posted', merchant: '', psCategory, memo: null, feedCreatedAt: '2026-10-20T01:00:00Z',
  });
  const add = async (r: TransactionRow) => {
    await repo.upsertFeedTransactions([{ accountId: bank, row: r }]);
    return Number((await db.query<{ id: number }>('select id from transaction where external_id = $1', [r.externalId]))[0]!.id);
  };
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body) });
  const categories = async () => ((await (await call('GET', '/categories')).json()) as { categories: { id: number; name: string; emoji: string; color: string }[] }).categories;
  return { db, repo, app, cat, row, add, call, categories };
}

describe('PATCH /categories/:id', () => {
  it('renames and restyles a category, trimming the name', async () => {
    const { call, cat, categories } = await setup();
    const res = await call('PATCH', `/categories/${cat('Dining out')}`, { name: ' Restaurants ', emoji: '🍝', color: 'pink' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: cat('Dining out'), name: 'Restaurants', emoji: '🍝', color: 'pink' });
    expect((await categories()).find((c) => c.id === cat('Dining out'))).toMatchObject({ name: 'Restaurants' });
  });

  it('changes only the fields sent', async () => {
    const { call, cat } = await setup();
    const res = await call('PATCH', `/categories/${cat('Coffee')}`, { emoji: '🫖' });
    expect(await res.json()).toMatchObject({ name: 'Coffee', emoji: '🫖', color: 'orange' });
  });

  it('409s on a name another category has, 404s on an unknown id, 400s on bad input', async () => {
    const { call, cat } = await setup();
    const dup = await call('PATCH', `/categories/${cat('Coffee')}`, { name: 'Groceries' });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({ error: 'category_exists' });
    expect((await call('PATCH', '/categories/99999', { name: 'X' })).status).toBe(404);
    for (const bad of [{}, { name: '' }, { name: 'a'.repeat(41) }, { emoji: '' }, { color: 'red' }, { name: 5 }]) {
      const r = await call('PATCH', `/categories/${cat('Coffee')}`, bad);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'bad_category' });
    }
    expect((await call('PATCH', '/categories/abc', { name: 'X' })).status).toBe(400);
  });

  it('a renamed category still catches what its old name caught', async () => {
    const { call, cat, add, row, repo, db } = await setup();
    await call('PATCH', `/categories/${cat('Dining out')}`, { name: 'Restaurants' });
    const id = await add(row('a', -3000, 'SOME BISTRO', 'Restaurants'));
    await runPipeline(repo, { since: null, now: T0 });
    const got = await db.query<{ category_id: number }>('select category_id from transaction where id = $1', [id]);
    expect(Number(got[0]!.category_id)).toBe(cat('Dining out'));
  });
});

describe('POST /categories/:id/merge', () => {
  it('moves transactions, splits, rules and the limit into the target, then deletes the source', async () => {
    const { call, cat, add, row, repo, db, categories } = await setup();
    const coffee = cat('Coffee');
    const dining = cat('Dining out');
    const plain = await add(row('a', -500, 'CAFE'));
    await repo.patchTransaction(plain, { categoryId: coffee });
    const split = await add(row('b', -1000, 'BRUNCH'));
    await call('PUT', `/transactions/${split}/splits`, { splits: [{ categoryId: coffee, amountCents: -400 }, { categoryId: dining, amountCents: -600 }] });
    const mixed = await add(row('c', -1000, 'MARKET'));
    await call('PUT', `/transactions/${mixed}/splits`, { splits: [{ categoryId: coffee, amountCents: -300 }, { categoryId: cat('Groceries'), amountCents: -700 }] });
    await call('POST', '/rules', { origin: 'user', matchText: 'cafe', categoryId: coffee, applyToPast: false });
    await call('POST', '/limits', { categoryId: coffee, amountCents: 10000 });

    const res = await call('POST', `/categories/${coffee}/merge`, { into: dining });
    expect(res.status).toBe(200);

    expect((await categories()).some((c) => c.id === coffee)).toBe(false);
    const cats = await db.query<{ id: number; category_id: number | null }>('select id, category_id from transaction order by id');
    expect(cats.find((r) => Number(r.id) === plain)!.category_id).toBe(dining);
    // Both parts are now Dining out, so the split folds back into a plain row.
    expect(cats.find((r) => Number(r.id) === split)!.category_id).toBe(dining);
    const splits = await db.query<{ transaction_id: string; category_id: number; amount_cents: string }>(
      'select transaction_id::text, category_id, amount_cents::text from transaction_split order by transaction_id, category_id',
    );
    expect(splits.filter((s) => Number(s.transaction_id) === split)).toEqual([]);
    expect(splits.filter((s) => Number(s.transaction_id) === mixed).map((s) => [s.category_id, s.amount_cents]).sort()).toEqual(
      [[dining, '-300'], [cat('Groceries'), '-700']].sort(),
    );
    const rules = await db.query<{ category_id: number }>(`select category_id from rule where match_text = 'cafe'`);
    expect(rules.map((r) => r.category_id)).toEqual([dining]);
    const limits = await db.query<{ category_id: number }>('select category_id from spending_limit');
    expect(limits.map((l) => l.category_id)).toEqual([dining]);
  });

  it('keeps the target’s own limit when both have one', async () => {
    const { call, cat, db } = await setup();
    await call('POST', '/limits', { categoryId: cat('Coffee'), amountCents: 10000 });
    await call('POST', '/limits', { categoryId: cat('Dining out'), amountCents: 50000 });
    await call('POST', `/categories/${cat('Coffee')}/merge`, { into: cat('Dining out') });
    const limits = await db.query<{ category_id: number; amount_cents: string }>('select category_id, amount_cents::text from spending_limit');
    expect(limits).toEqual([{ category_id: cat('Dining out'), amount_cents: '50000' }]);
  });

  it('the target catches what the merged category used to', async () => {
    const { call, cat, add, row, repo, db } = await setup();
    await call('POST', `/categories/${cat('Coffee')}/merge`, { into: cat('Dining out') });
    const id = await add(row('a', -450, 'SOME KIOSK', 'Cafe'));
    await runPipeline(repo, { since: null, now: T0 });
    const got = await db.query<{ category_id: number }>('select category_id from transaction where id = $1', [id]);
    expect(Number(got[0]!.category_id)).toBe(cat('Dining out'));
  });

  it('400s merging into itself or with a bad body, 404s on unknown ids', async () => {
    const { call, cat } = await setup();
    const coffee = cat('Coffee');
    for (const body of [{ into: coffee }, {}, { into: 'x' }, { into: 0 }]) {
      const r = await call('POST', `/categories/${coffee}/merge`, body);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'bad_merge' });
    }
    expect((await call('POST', '/categories/99999/merge', { into: coffee })).status).toBe(404);
    expect((await call('POST', `/categories/${coffee}/merge`, { into: 99999 })).status).toBe(404);
  });

  it('401s without a token', async () => {
    const { app } = await setup();
    expect((await app.request('/categories/1', { method: 'PATCH', body: '{"name":"x"}' })).status).toBe(401);
    expect((await app.request('/categories/1/merge', { method: 'POST', body: '{"into":2}' })).status).toBe(401);
  });
});

describe('categoryIdByName', () => {
  it('maps names and aliases, a current name winning over another category’s alias', () => {
    const map = categoryIdByName([
      { id: 1, name: 'Restaurants', aliases: ['Dining out'] },
      { id: 2, name: 'Dining out', aliases: [] },
      { id: 3, name: 'Coffee', aliases: ['Coffee', 'Tea'] },
    ]);
    expect(map.get('Restaurants')).toBe(1);
    expect(map.get('Dining out')).toBe(2);
    expect(map.get('Tea')).toBe(3);
  });
});
