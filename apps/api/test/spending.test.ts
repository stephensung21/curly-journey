import { describe, expect, it } from 'vitest';
import type { TransactionRow } from '@curly/core';
import { createApp } from '../src/app';
import { makeRepo } from '../src/db/repo';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

const T0 = new Date('2026-10-23T00:00:00Z');

async function setup() {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const repo = makeRepo(db);
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => T0 });
  const auth = { Authorization: `Bearer ${token}` };
  const acct = (n: number, institution: string, kind: 'transaction' | 'credit_card') =>
    repo.upsertAccount({ source: 'pocketsmith', externalId: String(n), institution, name: `A${n}`, kind, balanceCents: 0, balanceDate: '2026-10-22' });
  const bank = await acct(1, 'CommBank', 'transaction');
  const amex = await acct(2, 'American Express', 'credit_card');
  const cats = await repo.listCategories();
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  let n = 0;
  const add = async (
    accountId: number,
    date: string,
    amountCents: number,
    o: { cat?: string; flow?: string; merchant?: string; psCategory?: string; source?: string } = {},
  ) => {
    const r: TransactionRow = {
      source: 'pocketsmith', externalId: `x${++n}`, accountExternalId: '1', date, amountCents,
      descriptionRaw: 'DESC', payee: 'p', status: 'posted', merchant: o.merchant ?? '',
      psCategory: o.psCategory ?? null, memo: null, feedCreatedAt: '2026-10-20T00:00:00Z',
    };
    await repo.upsertFeedTransactions([{ accountId, row: r }]);
    const id = Number((await db.query<{ id: number }>('select id from transaction where external_id = $1', [r.externalId]))[0]!.id);
    await db.query(
      `update transaction set category_id = $2, category_source = $3, flow = coalesce($4, flow), categorised = true where id = $1`,
      [id, o.cat ? cat(o.cat) : null, o.cat ? (o.source ?? 'rule') : null, o.flow ?? null],
    );
    return id;
  };
  const get = async <T = unknown>(path: string) => {
    const res = await app.request(path, { headers: auth });
    return { status: res.status, body: (await res.json()) as T };
  };
  return { db, repo, app, auth, bank, amex, cat, add, get };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

type Summary = {
  totalCents: number; moneyInCents: number; mortgageCents: number; prevTotalCents: number; from: string; to: string;
  byCategory: { categoryId: number | null; cents: number; count: number }[];
  byInstitution: { institution: string; cents: number }[];
  notCounted: { flow: string; cents: number; count: number }[];
  uncategorisedCount: number;
};

async function seedDefinitions(s: Ctx) {
  await s.add(s.bank, '2026-10-02', -5000, { cat: 'Groceries' });
  await s.add(s.bank, '2026-10-03', 1000, { cat: 'Groceries' }); // refund
  await s.add(s.bank, '2026-10-04', -1000); // uncategorised
  await s.add(s.amex, '2026-10-05', -3000, { cat: 'Dining out' });
  await s.add(s.bank, '2026-10-06', 20000, { cat: 'Income' });
  await s.add(s.bank, '2026-10-07', -9000, { flow: 'mortgage' });
  await s.add(s.bank, '2026-10-08', -2000, { flow: 'transfer' });
}

describe('auth', () => {
  it('401s every route without a token', async () => {
    const { app } = await setup();
    for (const p of ['/spending?month=2026-10', '/spending/inout?end=2026-10', '/spending/daily?month=2026-10', '/inbox', '/stats/categorisation']) {
      expect((await app.request(p)).status, p).toBe(401);
    }
  });
});

describe('GET /spending', () => {
  it('summarises the definitions example', async () => {
    const s = await setup();
    await seedDefinitions(s);
    await s.add(s.bank, '2026-09-10', -1234, { cat: 'Groceries' });
    const { status, body } = await s.get<Summary>('/spending?month=2026-10');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      from: '2026-10-01', to: '2026-10-31', totalCents: 8000, moneyInCents: 20000, mortgageCents: 9000,
      prevTotalCents: 1234, uncategorisedCount: 1,
    });
    expect(body.byCategory).toEqual([
      { categoryId: s.cat('Groceries'), cents: 4000, count: 2 },
      { categoryId: s.cat('Dining out'), cents: 3000, count: 1 },
      { categoryId: null, cents: 1000, count: 1 },
    ]);
    expect(body.byInstitution).toEqual([{ institution: 'CommBank', cents: 5000 }, { institution: 'Amex', cents: 3000 }]);
    expect(body.notCounted).toEqual([
      { flow: 'transfer', cents: 2000, count: 1 },
      { flow: 'mortgage', cents: 9000, count: 1 },
    ]);
  });

  it('flags Amex payments by description or by a pair on a card, and returns last month for the toggle', async () => {
    const s = await setup();
    const byName = await s.add(s.bank, '2026-10-03', -50000, { flow: 'transfer' });
    await s.db.query("update transaction set description_raw = 'AMEX CARD PAYMENT' where id = $1", [byName]);
    const out = await s.add(s.bank, '2026-10-04', -30000, { flow: 'transfer' });
    const inn = await s.add(s.amex, '2026-10-04', 30000, { flow: 'transfer' });
    await s.db.query('update transaction set pair_id = $2 where id = $1', [out, inn]);
    await s.add(s.bank, '2026-10-05', -7000, { flow: 'transfer' });
    await s.add(s.bank, '2026-09-05', -9000, { flow: 'mortgage' });
    const prevCard = await s.add(s.bank, '2026-09-06', -11000, { flow: 'transfer' });
    await s.db.query("update transaction set description_raw = 'AMERICAN EXPRESS' where id = $1", [prevCard]);
    await s.add(s.bank, '2026-10-06', -2500, { cat: 'Groceries' });
    await s.add(s.bank, '2026-10-07', 500, { cat: 'Groceries' });
    const { body } = await s.get<Summary & { prevMortgageCents: number; prevCardPaymentCents: number }>('/spending?month=2026-10');
    expect(body).toMatchObject({ cardPaymentCents: 80000, outCents: 2500, backCents: 500, totalCents: 2000 });
    expect(body).toMatchObject({ prevMortgageCents: 9000, prevCardPaymentCents: 11000 });
  });

  it('filters by institution', async () => {
    const s = await setup();
    await seedDefinitions(s);
    const { body } = await s.get<Summary>('/spending?month=2026-10&institution=Amex');
    expect(body.totalCents).toBe(3000);
    expect(body.moneyInCents).toBe(0);
  });

  it('counts both parts of a split row', async () => {
    const s = await setup();
    const id = await s.add(s.bank, '2026-10-02', -5000, { cat: 'Groceries' });
    await s.repo.setSplits(id, [{ categoryId: s.cat('Groceries'), amountCents: -3000 }, { categoryId: s.cat('Home'), amountCents: -2000 }]);
    const { body } = await s.get<Summary>('/spending?month=2026-10');
    expect(body.totalCents).toBe(5000);
    expect(body.byCategory).toEqual([
      { categoryId: s.cat('Groceries'), cents: 3000, count: 1 },
      { categoryId: s.cat('Home'), cents: 2000, count: 1 },
    ]);
  });

  it('excludes counts_spending=false accounts unless accountId is given', async () => {
    const s = await setup();
    await s.add(s.bank, '2026-10-02', -1000, { cat: 'Groceries' });
    await s.add(s.amex, '2026-10-02', -700, { cat: 'Groceries' });
    await s.db.query('update account set counts_spending = false where id = $1', [s.amex]);
    expect((await s.get<Summary>('/spending?month=2026-10')).body.totalCents).toBe(1000);
    expect((await s.get<Summary>(`/spending?month=2026-10&accountId=${s.amex}`)).body.totalCents).toBe(700);
  });

  it('uses the previous statement period for prevTotalCents', async () => {
    const s = await setup();
    await s.add(s.amex, '2026-10-10', -500, { cat: 'Groceries' });
    await s.add(s.amex, '2026-09-10', -300, { cat: 'Groceries' }); // Aug 26 - Sep 25
    await s.add(s.amex, '2026-09-26', -900, { cat: 'Groceries' }); // in the Oct statement
    const { body } = await s.get<Summary>(`/spending?month=2026-10&period=statement&accountId=${s.amex}`);
    expect(body).toMatchObject({ from: '2026-09-26', to: '2026-10-25', totalCents: 1400, prevTotalCents: 300 });
  });

  it('validates input', async () => {
    const s = await setup();
    expect((await s.get('/spending?month=nope')).body).toEqual({ error: 'bad_month' });
    expect((await s.get('/spending?month=2026-10&period=statement')).body).toEqual({ error: 'bad_period' });
    expect((await s.get('/spending?month=2026-10&period=x')).body).toEqual({ error: 'bad_period' });
    expect((await s.get('/spending?month=2026-10&accountId=abc')).body).toEqual({ error: 'bad_id' });
  });
});

describe('GET /spending/inout', () => {
  it('returns 6 months oldest first including zero months', async () => {
    const s = await setup();
    await seedDefinitions(s);
    const { body } = await s.get<{ months: { month: string; inCents: number; mortgageCents: number; spendingCents: number }[] }>(
      '/spending/inout?end=2026-10',
    );
    expect(body.months.map((m) => m.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(body.months[0]).toEqual({ month: '2026-05', inCents: 0, mortgageCents: 0, spendingCents: 0 });
    expect(body.months[5]).toEqual({ month: '2026-10', inCents: 20000, mortgageCents: 9000, spendingCents: 8000 });
  });

  it('validates end and months', async () => {
    const s = await setup();
    expect((await s.get('/spending/inout?end=x')).body).toEqual({ error: 'bad_month' });
    for (const m of ['0', '13', 'a', '1.5']) {
      const r = await s.get(`/spending/inout?end=2026-10&months=${m}`);
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: 'bad_months' });
    }
    expect((await s.get<{ months: unknown[] }>('/spending/inout?end=2026-10&months=12')).body.months).toHaveLength(12);
  });
});

describe('GET /spending/daily', () => {
  it('runs cumulatively up to Sydney today', async () => {
    const s = await setup(); // T0 is 2026-10-23 11:00 in Sydney
    await s.add(s.bank, '2026-10-02', -5000, { cat: 'Groceries' });
    await s.add(s.bank, '2026-10-04', -1000, { cat: 'Groceries' });
    const { body } = await s.get<{ days: { day: number; spendingCents: number }[] }>('/spending/daily?month=2026-10');
    expect(body.days).toHaveLength(23);
    expect(body.days[0]!.spendingCents).toBe(0);
    expect(body.days[1]!.spendingCents).toBe(5000);
    expect(body.days[22]!.spendingCents).toBe(6000);
    expect((await s.get('/spending/daily?month=bad')).body).toEqual({ error: 'bad_month' });
  });
});

type Inbox = { items: { id: number; merchant: string; guesses: number[] }[]; total: number };

describe('GET /inbox', () => {
  it('lists uncategorised normal spending, guessing the merchant list first without user history', async () => {
    const s = await setup();
    const w = await s.add(s.bank, '2026-10-02', -500, { merchant: 'Woolworths', psCategory: 'Coffee' });
    await s.add(s.bank, '2026-10-03', 500); // positive: excluded
    await s.add(s.bank, '2026-10-03', -500, { flow: 'transfer' }); // not normal
    await s.add(s.bank, '2026-10-03', -500, { cat: 'Groceries' }); // categorised
    await s.add(s.bank, '2026-10-01', -200, { merchant: 'Unknownshop' });
    await s.add(s.bank, '2026-09-01', -900, { cat: 'Home', merchant: 'Other' });
    const { body } = await s.get<Inbox>('/inbox');
    expect(body.total).toBe(2);
    expect(body.items[0]!.id).toBe(w);
    expect(body.items[0]!.guesses.slice(0, 2)).toEqual([s.cat('Groceries'), s.cat('Coffee')]);
    expect(new Set(body.items[0]!.guesses).size).toBe(body.items[0]!.guesses.length);
    expect(body.items[0]!.guesses.length).toBeLessThanOrEqual(3);
    expect(body.items[1]!.guesses).toEqual([s.cat("Groceries"), s.cat("Home")]); // top categories by count, ties by id
  });

  it('puts the latest user-set category for the merchant first', async () => {
    const s = await setup();
    await s.add(s.bank, '2026-09-01', -500, { merchant: 'Woolworths', cat: 'Home', source: 'user' });
    await s.add(s.bank, '2026-10-02', -500, { merchant: 'Woolworths' });
    const { body } = await s.get<Inbox>('/inbox');
    expect(body.items[0]!.guesses.slice(0, 2)).toEqual([s.cat('Home'), s.cat('Groceries')]);
  });

  it('caps items at 50 but reports the full total', async () => {
    const s = await setup();
    for (let i = 0; i < 52; i++) await s.add(s.bank, '2026-10-02', -100, { merchant: 'M' });
    const { body } = await s.get<Inbox>('/inbox');
    expect(body.items).toHaveLength(50);
    expect(body.total).toBe(52);
  });
});

describe('drill-down matches the Spending bar', () => {
  it('totals and lists Groceries, Home and none like /spending, split-aware, without excluded accounts', async () => {
    const s = await setup();
    const excluded = await s.repo.upsertAccount({ source: 'pocketsmith', externalId: '3', institution: 'CommBank', name: 'Joint', kind: 'transaction', balanceCents: 0, balanceDate: '2026-10-22' });
    await s.db.query('update account set counts_spending = false where id = $1', [excluded]);
    const plain = await s.add(s.bank, '2026-10-02', -5000, { cat: 'Groceries' });
    const split = await s.add(s.bank, '2026-10-03', -3000, { cat: 'Groceries' });
    await s.repo.setSplits(split, [{ categoryId: s.cat('Groceries'), amountCents: -1000 }, { categoryId: s.cat('Home'), amountCents: -2000 }]);
    const unsortedSplit = await s.add(s.bank, '2026-10-04', -600);
    await s.repo.setSplits(unsortedSplit, [{ categoryId: s.cat('Home'), amountCents: -100 }, { categoryId: s.cat('Groceries'), amountCents: -500 }]);
    const none = await s.add(s.bank, '2026-10-05', -400);
    await s.add(excluded, '2026-10-02', -700, { cat: 'Groceries' });
    await s.add(excluded, '2026-10-02', -300);

    type Txns = { transactions: { id: number }[]; totalCents: number };
    for (const institution of ['', '&institution=CommBank']) {
      const bars = (await s.get<Summary>(`/spending?month=2026-10${institution}`)).body.byCategory;
      const bar = (id: number | null) => bars.find((b) => b.categoryId === id)!.cents;
      const drill = async (id: number | 'none') => (await s.get<Txns>(`/transactions?month=2026-10&categoryId=${id}${institution}`)).body;

      const groceries = await drill(s.cat('Groceries'));
      expect(groceries.totalCents).toBe(bar(s.cat('Groceries')));
      expect(groceries.totalCents).toBe(6500);
      expect(groceries.transactions.map((t) => t.id).sort()).toEqual([plain, split, unsortedSplit].sort());

      const home = await drill(s.cat('Home'));
      expect(home.totalCents).toBe(bar(s.cat('Home')));
      expect(home.transactions.map((t) => t.id).sort()).toEqual([split, unsortedSplit].sort());

      const unc = await drill('none');
      expect(unc.totalCents).toBe(bar(null));
      expect(unc.transactions.map((t) => t.id)).toEqual([none]);
    }
  });

  it('gives 0 for a category with no spending, and no total without a category', async () => {
    const s = await setup();
    const { body } = await s.get<{ totalCents?: number }>(`/transactions?month=2026-10&categoryId=${s.cat('Pets')}`);
    expect(body.totalCents).toBe(0);
    expect((await s.get<{ totalCents?: number }>('/transactions?month=2026-10')).body.totalCents).toBeUndefined();
  });
});

describe('split rows', () => {
  it('never appear in the inbox, even with no category of their own', async () => {
    const s = await setup();
    const split = await s.add(s.bank, '2026-10-02', -600, { merchant: 'Costco' });
    await s.repo.setSplits(split, [{ categoryId: s.cat('Home'), amountCents: -100 }, { categoryId: s.cat('Groceries'), amountCents: -500 }]);
    const plain = await s.add(s.bank, '2026-10-03', -500, { merchant: 'Unknownshop' });
    const { body } = await s.get<Inbox>('/inbox');
    expect(body.items.map((i) => i.id)).toEqual([plain]);
    expect(body.total).toBe(1);
  });
});

describe('GET /stats/categorisation', () => {
  it('is null with no sample', async () => {
    const s = await setup();
    expect((await s.get('/stats/categorisation')).body).toEqual({ autoPercent: null, sample: 0 });
  });

  it('rounds the share of auto-categorised rows created in the last 30 days', async () => {
    const s = await setup();
    const ids: number[] = [];
    for (let i = 0; i < 4; i++) ids.push(await s.add(s.bank, '2026-10-02', -100, { cat: 'Groceries' }));
    const old = await s.add(s.bank, '2026-08-02', -100, { cat: 'Groceries' });
    await s.db.query(`update transaction set created_at = '2026-10-20T00:00:00Z', initial_source = 'rule'`);
    await s.db.query(`update transaction set initial_source = null where id = $1`, [ids[0]]);
    await s.db.query(`update transaction set created_at = '2026-08-01T00:00:00Z' where id = $1`, [old]);
    expect((await s.get('/stats/categorisation')).body).toEqual({ autoPercent: 75, sample: 4 });
  });
});
