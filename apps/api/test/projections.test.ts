import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

const NOW = new Date('2026-10-24T02:00:00Z');

async function setup() {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => NOW });
  const auth = { Authorization: `Bearer ${token}` };
  const get = () => app.request('/projections', { headers: auth });
  const put = (body: unknown) =>
    app.request('/projections/profile', {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const acct = async (source: string, ext: string, kind: string, cents: number, projections = 'off', offset = false) => {
    const r = await db.query<{ id: number }>(
      `insert into account (source, external_id, institution, name, kind, balance_cents, balance_date, counts_spending, counts_net_worth, is_offset, projections)
       values ($1, $2, 'X', $2, $3, $4, '2026-10-20', false, true, $5, $6) returning id`,
      [source, ext, kind, cents, offset, projections],
    );
    return r[0]!.id;
  };
  return { db, app, get, put, acct };
}

type Profile = Record<string, unknown>;
type Body = { profile: Profile; prefill: Record<string, unknown> };

describe('GET /projections', () => {
  it('returns the default profile and zero pre-fill', async () => {
    const { get } = await setup();
    const r = await get();
    expect(r.status).toBe(200);
    const b = (await r.json()) as Body;
    expect(b.profile).toMatchObject({
      birthDate: null, taxRateBps: null, mortgageRateBps: null, repaymentCents: null, repaymentFrequency: 'monthly',
      termMonths: null, offsetGrowthCents: 0, returnBps: 700, inflationBps: 250, distributionYieldBps: 300,
      targetCents: 100_000_000, targetAge: 60, todaysDollars: false,
    });
    expect(b.prefill).toEqual({ etfStartCents: 0, etfMonthlyCents: 0, mortgageBalanceCents: 0, offsetCents: 0, today: '2026-10-24' });
  });

  it('pre-fills from accounts and CommSec trades', async () => {
    const { db, get, acct } = await setup();
    const cs = await acct('commsec', 'cs', 'investment', 5_000_000, 'etf');
    await acct('pocketsmith', 'm', 'mortgage', -60_000_000, 'mortgage');
    await acct('pocketsmith', 'o1', 'transaction', 1_000_000, 'off', true);
    await acct('pocketsmith', 'o2', 'transaction', 2_000_000, 'off', true);
    await db.query(
      `insert into trade (account_id, date, side, symbol, units, price_micros, brokerage_cents, total_cents, source, fingerprint)
       values ($1, '2026-09-01', 'buy', 'VAS', 10, 1000000, 0, 1200000, 'manual', 'a'),
              ($1, '2024-01-01', 'buy', 'VAS', 10, 1000000, 0, 9900000, 'manual', 'b')`,
      [cs],
    );
    const b = (await (await get()).json()) as Body;
    expect(b.prefill).toEqual({
      etfStartCents: 5_000_000, etfMonthlyCents: 100_000, mortgageBalanceCents: 60_000_000, offsetCents: 3_000_000, today: '2026-10-24',
    });
  });

  it('floors negative sums at zero', async () => {
    const { get, acct } = await setup();
    await acct('pocketsmith', 'm', 'mortgage', 500, 'mortgage');
    await acct('pocketsmith', 'o', 'transaction', -500, 'off', true);
    const b = (await (await get()).json()) as Body;
    expect(b.prefill).toMatchObject({ mortgageBalanceCents: 0, offsetCents: 0 });
  });

  it('requires auth', async () => {
    const { app } = await setup();
    expect((await app.request('/projections')).status).toBe(401);
    expect((await app.request('/projections/profile', { method: 'PUT', body: '{}' })).status).toBe(401);
  });
});

describe('PUT /projections/profile', () => {
  it('applies partial updates and keeps other fields', async () => {
    const { put, get } = await setup();
    const r = await put({ birthDate: '1990-05-01', taxRateBps: 3250, todaysDollars: true, repaymentFrequency: 'fortnightly' });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      birthDate: '1990-05-01', taxRateBps: 3250, todaysDollars: true, repaymentFrequency: 'fortnightly', returnBps: 700,
    });
    const r2 = await put({ taxRateBps: null, repaymentCents: 250_000 });
    expect(await r2.json()).toMatchObject({ birthDate: '1990-05-01', taxRateBps: null, repaymentCents: 250_000 });
    const b = (await (await get()).json()) as Body;
    expect(b.profile).toMatchObject({ birthDate: '1990-05-01', taxRateBps: null, repaymentCents: 250_000 });
  });

  it('accepts an empty body and null birth date', async () => {
    const { put } = await setup();
    expect((await put({})).status).toBe(200);
    expect(await (await put({ birthDate: null })).json()).toMatchObject({ birthDate: null });
  });

  it.each([
    ['future birth date', { birthDate: '2026-10-25' }],
    ['far future birth date', { birthDate: '2026-12-01' }],
    ['fake date', { birthDate: '2026-02-30' }],
    ['bad date format', { birthDate: '1990-5-1' }],
    ['tax 7000', { taxRateBps: 7000 }],
    ['negative tax', { taxRateBps: -1 }],
    ['non-integer', { returnBps: 1.5 }],
    ['string number', { returnBps: '700' }],
    ['zero repayment', { repaymentCents: 0 }],
    ['term 601', { termMonths: 601 }],
    ['target age 17', { targetAge: 17 }],
    ['null for non-nullable', { returnBps: null }],
    ['bad frequency', { repaymentFrequency: 'daily' }],
    ['string bool', { todaysDollars: 'yes' }],
    ['unknown key', { nope: 1 }],
    ['id key', { id: 2 }],
    ['unsafe integer', { targetCents: 2 ** 60 }],
    ['array body', []],
  ])('rejects %s', async (_n, body) => {
    const { put } = await setup();
    const r = await put(body);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'bad_profile' });
  });

  it('accepts today as birth date', async () => {
    const { put } = await setup();
    expect((await put({ birthDate: '2026-10-24' })).status).toBe(200);
  });

  it('rejects invalid JSON', async () => {
    const { app } = await setup();
    const r = await app.request('/projections/profile', { method: 'PUT', headers: { Authorization: 'Bearer cj_test_token' }, body: '{' });
    expect(r.status).toBe(400);
  });
});
