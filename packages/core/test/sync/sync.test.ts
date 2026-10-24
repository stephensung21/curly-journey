import { describe, it, expect } from 'vitest';
import {
  mapAccount, mapTransaction, kindFromPocketSmithType, defaultCounts, isStale, STALE_AFTER_MS,
} from '../../src/index';

describe('kindFromPocketSmithType', () => {
  it('maps types', () => {
    expect(kindFromPocketSmithType('bank', 'Everyday')).toBe('transaction');
    expect(kindFromPocketSmithType('bank', 'Goal SAVER')).toBe('savings');
    expect(kindFromPocketSmithType('bank', 'Online Savings')).toBe('savings');
    expect(kindFromPocketSmithType('credits', 'Amex')).toBe('credit_card');
    expect(kindFromPocketSmithType('loans', 'x')).toBe('mortgage');
    expect(kindFromPocketSmithType('mortgage', 'x')).toBe('mortgage');
    expect(kindFromPocketSmithType('stocks', 'x')).toBe('brokerage');
    for (const t of ['property', 'vehicle', 'other_asset']) {
      expect(kindFromPocketSmithType(t, 'x')).toBe('manual_asset');
    }
  });
});

describe('mapTransaction', () => {
  const base = {
    id: 42, payee: 'Cafe', original_payee: null, date: '2026-10-01', amount: -12.3,
    status: 'posted' as const, updated_at: '2026-10-02T00:00:00Z', transaction_account: { id: 7 },
    category: { title: 'Eating Out' }, memo: 'lunch', created_at: '2026-10-01T05:00:00Z',
  };
  it('maps fields', () => {
    expect(mapTransaction(base)).toEqual({
      source: 'pocketsmith', externalId: '42', accountExternalId: '7', date: '2026-10-01',
      amountCents: -1230, descriptionRaw: 'Cafe', payee: 'Cafe', status: 'posted',
      merchant: 'Cafe', psCategory: 'Eating Out', memo: 'lunch', feedCreatedAt: '2026-10-01T05:00:00Z',
    });
  });
  it('cleans the merchant from payee, falling back to original_payee', () => {
    expect(mapTransaction({ ...base, payee: 'WOOLWORTHS 1234 SYDNEY' }).merchant).toBe('Woolworths');
    expect(mapTransaction({ ...base, payee: '', original_payee: 'WOOLWORTHS 1234 SYDNEY' }).merchant).toBe('Woolworths');
    expect(mapTransaction({ ...base, category: null, memo: null })).toMatchObject({ psCategory: null, memo: null });
  });
  it('is float-safe', () => {
    expect(mapTransaction({ ...base, amount: 0.1 + 0.2 }).amountCents).toBe(30);
  });
  it('prefers original_payee', () => {
    expect(mapTransaction({ ...base, original_payee: 'CAFE 123 SYD' }).descriptionRaw).toBe('CAFE 123 SYD');
  });
});

describe('mapAccount', () => {
  it('maps fields', () => {
    expect(mapAccount({
      id: 9, name: 'Mortgage', number: null, type: 'loans', currency_code: 'aud',
      current_balance: -500000.55, current_balance_date: '2026-10-22',
      institution: { id: 1, title: 'CommBank' },
    })).toEqual({
      source: 'pocketsmith', externalId: '9', institution: 'CommBank', name: 'Mortgage',
      kind: 'mortgage', balanceCents: -50000055, balanceDate: '2026-10-22',
    });
  });
});

describe('defaultCounts', () => {
  it('matches table', () => {
    for (const k of ['transaction', 'savings', 'credit_card'] as const) {
      expect(defaultCounts(k)).toEqual({ countsSpending: true, countsNetWorth: true, projections: 'off' });
    }
    expect(defaultCounts('mortgage')).toEqual({ countsSpending: false, countsNetWorth: true, projections: 'mortgage' });
    expect(defaultCounts('brokerage')).toEqual({ countsSpending: false, countsNetWorth: true, projections: 'etf' });
    expect(defaultCounts('manual_asset')).toEqual({ countsSpending: false, countsNetWorth: true, projections: 'off' });
  });
});

describe('isStale', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  it('null is stale', () => expect(isStale(null, now)).toBe(true));
  it('exactly 36h is fresh', () => {
    expect(isStale(new Date(now.getTime() - STALE_AFTER_MS), now)).toBe(false);
  });
  it('36h + 1ms is stale', () => {
    expect(isStale(new Date(now.getTime() - STALE_AFTER_MS - 1), now)).toBe(true);
  });
});

describe('defaultCounts crypto', () => {
  it('counts net worth only', () => {
    expect(defaultCounts('crypto')).toEqual({ countsSpending: false, countsNetWorth: true, projections: 'off' });
  });
});
