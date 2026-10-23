import { describe, expect, it } from 'vitest';
import type { TransactionRow } from '@curly/core';
import { createApp } from '../src/app';
import { makeRepo } from '../src/db/repo';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

type Status = { id: number; categoryId: number | null; amountCents: number; warnPercent: number; spentCents: number; percent: number; level: string; alertedAt: string | null };

async function setup() {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const repo = makeRepo(db);
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => new Date('2026-10-23T00:00:00Z') });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const bank = await repo.upsertAccount({ source: 'pocketsmith', externalId: '1', institution: 'CommBank', name: 'Everyday', kind: 'transaction', balanceCents: 0, balanceDate: '2026-10-22' });
  const cats = await repo.listCategories();
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  const incomeCat = cats.find((c) => c.kind === 'income')!.id;
  let n = 0;
  const spend = async (categoryName: string, amountCents: number) => {
    const row: TransactionRow = {
      source: 'pocketsmith', externalId: `x${++n}`, accountExternalId: '1', date: '2026-10-05', amountCents,
      descriptionRaw: 'DESC', payee: 'p', status: 'posted', merchant: '', psCategory: null, memo: null, feedCreatedAt: '2026-10-20T00:00:00Z',
    };
    await repo.upsertFeedTransactions([{ accountId: bank, row }]);
    await db.query(
      "update transaction set category_id = $2, category_source = 'rule', categorised = true where external_id = $1",
      [row.externalId, cat(categoryName)],
    );
  };
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body) });
  const statuses = async (month = '2026-10') => ((await (await call('GET', `/limits?month=${month}`)).json()) as { limits: Status[] }).limits;
  return { db, call, cat, incomeCat, spend, statuses };
}

describe('limits API', () => {
  it('creates a whole-month and a category limit; a second whole-month is 409', async () => {
    const { call, cat } = await setup();
    const whole = await call('POST', '/limits', { categoryId: null, amountCents: 300000 });
    expect(whole.status).toBe(201);
    expect(await whole.json()).toMatchObject({ categoryId: null, amountCents: 300000, warnPercent: 80 });
    const groc = await call('POST', '/limits', { categoryId: cat('Groceries'), amountCents: 50000, warnPercent: 90 });
    expect(groc.status).toBe(201);
    expect(await groc.json()).toMatchObject({ categoryId: cat('Groceries'), warnPercent: 90 });
    const dupWhole = await call('POST', '/limits', { categoryId: null, amountCents: 1000 });
    expect(dupWhole.status).toBe(409);
    expect(await dupWhole.json()).toEqual({ error: 'limit_exists' });
    expect((await call('POST', '/limits', { categoryId: cat('Groceries'), amountCents: 1000 })).status).toBe(409);
  });

  it('rejects bad input', async () => {
    const { call, cat, incomeCat } = await setup();
    const income = await call('POST', '/limits', { categoryId: incomeCat, amountCents: 1000 });
    expect(income.status).toBe(400);
    expect(await income.json()).toEqual({ error: 'category_not_found' });
    expect(await (await call('POST', '/limits', { categoryId: 99999, amountCents: 1000 })).json()).toEqual({ error: 'category_not_found' });
    for (const body of [
      { categoryId: cat('Groceries'), amountCents: 1000, warnPercent: 100 },
      { categoryId: cat('Groceries'), amountCents: 1000, warnPercent: 49 },
      { categoryId: cat('Groceries'), amountCents: 0 },
      { categoryId: cat('Groceries'), amountCents: 10.5 },
      { amountCents: 1000 },
    ]) {
      const res = await call('POST', '/limits', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_limit' });
    }
  });

  it('GET returns percent, level and alertedAt per limit', async () => {
    const { db, call, cat, spend, statuses } = await setup();
    await spend('Groceries', -42000);
    await spend('Coffee', -8000);
    const whole = (await (await call('POST', '/limits', { categoryId: null, amountCents: 100000 })).json()) as { id: number };
    const groc = (await (await call('POST', '/limits', { categoryId: cat('Groceries'), amountCents: 50000 })).json()) as { id: number };
    const out = await statuses();
    expect(out.find((l) => l.id === groc.id)).toMatchObject({ spentCents: 42000, percent: 84, level: 'warn', alertedAt: null });
    expect(out.find((l) => l.id === whole.id)).toMatchObject({ spentCents: 50000, percent: 50, level: 'ok', alertedAt: null });

    await db.query("insert into notification_log (key, sent_at) values ($1, '2026-10-06T01:00:00Z')", [`limit:${groc.id}:2026-10:80`]);
    await db.query("insert into notification_log (key, sent_at) values ($1, '2026-10-07T02:30:00Z')", [`limit:${groc.id}:2026-10:100`]);
    await db.query("insert into notification_log (key, sent_at) values ($1, '2026-10-09T00:00:00Z')", [`limit:${groc.id}:2026-09:100`]);
    const after = await statuses();
    expect(after.find((l) => l.id === groc.id)!.alertedAt).toBe('2026-10-07T02:30:00.000Z');
    expect(after.find((l) => l.id === whole.id)!.alertedAt).toBeNull();
    expect((await statuses('2026-09')).find((l) => l.id === groc.id)!.alertedAt).toBe('2026-10-09T00:00:00.000Z');
  });

  it('GET rejects a bad month', async () => {
    const { call } = await setup();
    expect((await call('GET', '/limits?month=2026-13')).status).toBe(400);
  });

  it('PATCH changes the amount and warn percent; unknown id is 404', async () => {
    const { call, cat, statuses } = await setup();
    const groc = (await (await call('POST', '/limits', { categoryId: cat('Groceries'), amountCents: 50000 })).json()) as { id: number };
    const res = await call('PATCH', `/limits/${groc.id}`, { amountCents: 70000, warnPercent: 60 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: groc.id, amountCents: 70000, warnPercent: 60 });
    expect((await statuses())[0]).toMatchObject({ amountCents: 70000, warnPercent: 60 });
    expect((await call('PATCH', `/limits/${groc.id}`, { warnPercent: 100 })).status).toBe(400);
    const missing = await call('PATCH', '/limits/9999', { amountCents: 100 });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'limit_not_found' });
  });

  it('DELETE removes the limit; unknown id is 404', async () => {
    const { call, cat, statuses } = await setup();
    const groc = (await (await call('POST', '/limits', { categoryId: cat('Groceries'), amountCents: 50000 })).json()) as { id: number };
    expect((await call('DELETE', `/limits/${groc.id}`)).status).toBe(204);
    expect(await statuses()).toEqual([]);
    const again = await call('DELETE', `/limits/${groc.id}`);
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: 'limit_not_found' });
  });

  it('requires auth', async () => {
    const { db } = await setup();
    const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => new Date() });
    expect((await app.request('/limits?month=2026-10')).status).toBe(401);
  });
});
