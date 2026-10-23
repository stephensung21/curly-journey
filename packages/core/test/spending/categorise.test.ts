import { describe, expect, it } from 'vitest';
import {
  categorise,
  ruleMatches,
  type CategoriseContext,
  type CategoriseInput,
  type Rule,
} from '../../src';

const ids = new Map([
  ['Groceries', 1],
  ['Dining out', 2],
  ['Income', 21],
  ['Shopping', 5],
]);
const base: CategoriseInput = {
  accountId: 7,
  amountCents: -8420,
  description: 'WOOLWORTHS 1234',
  merchant: 'Woolworths',
  psCategory: null,
  isCreditCard: false,
};
const ctx0: CategoriseContext = { rules: [], pastByMerchant: new Map(), categoryIdByName: ids };
const learned: Rule = {
  id: 1,
  origin: 'learned',
  matchText: 'woolworths',
  accountId: null,
  amountCents: null,
  categoryId: 5,
  flow: null,
  createdAt: '2026-10-01',
};
const user: Rule = { ...learned, id: 2, origin: 'user', categoryId: 2 };
const unknown: CategoriseInput = { ...base, description: 'XYZ PTY', merchant: 'Xyz Pty' };
const past = new Map([['Woolworths', 21]]);

describe('categorise', () => {
  it('uses the merchant list', () => {
    expect(categorise(base, ctx0)).toEqual({ categoryId: 1, source: 'merchant', flow: null, ruleId: null });
  });
  it('user rule beats learned beats past beats merchant', () => {
    expect(categorise(base, { ...ctx0, rules: [learned, user], pastByMerchant: past }).categoryId).toBe(2);
    expect(categorise(base, { ...ctx0, rules: [learned], pastByMerchant: past }).source).toBe('learned');
    expect(categorise(base, { ...ctx0, pastByMerchant: past }).source).toBe('past');
  });
  it('newest rule wins within an origin', () => {
    const newer: Rule = { ...user, id: 9, categoryId: 1, createdAt: '2026-10-05' };
    expect(categorise(base, { ...ctx0, rules: [user, newer] })).toMatchObject({ categoryId: 1, ruleId: 9, source: 'rule' });
  });
  it('falls back to pocketsmith, default income, then inbox', () => {
    expect(categorise({ ...unknown, psCategory: 'Eating Out' }, ctx0).source).toBe('pocketsmith');
    expect(categorise({ ...unknown, amountCents: 470000 }, ctx0)).toMatchObject({ categoryId: 21, source: 'default' });
    expect(categorise({ ...unknown, amountCents: 4000, isCreditCard: true }, ctx0)).toMatchObject({ categoryId: null, source: null });
    expect(categorise(unknown, ctx0)).toMatchObject({ categoryId: null, source: null });
  });
  it('name missing from the map falls through', () => {
    expect(categorise(base, { ...ctx0, categoryIdByName: new Map() })).toMatchObject({ categoryId: null, source: null });
  });
  it('flow-only rule sets flow and keeps categorising', () => {
    const ns: Rule = { ...user, id: 3, matchText: 'JOHN SMITH', categoryId: null, flow: 'not_spending' };
    const t = { ...unknown, description: 'TRANSFER TO JOHN SMITH' };
    expect(categorise(t, { ...ctx0, rules: [ns] })).toMatchObject({ flow: 'not_spending', ruleId: 3, categoryId: null });
    const withCat: Rule = { ...learned, id: 4, matchText: 'JOHN', categoryId: 5 };
    expect(categorise(t, { ...ctx0, rules: [ns, withCat] })).toMatchObject({
      flow: 'not_spending', ruleId: 3, categoryId: 5, source: 'learned',
    });
  });
});

describe('ruleMatches', () => {
  it('checks account, amount and merchant text', () => {
    expect(ruleMatches({ ...user, accountId: 8 }, base)).toBe(false);
    expect(ruleMatches({ ...user, amountCents: -8420 }, base)).toBe(true);
    expect(ruleMatches({ ...user, amountCents: 1 }, base)).toBe(false);
    expect(ruleMatches({ ...user, matchText: 'Woolworths' }, { ...base, description: 'x' })).toBe(true);
    expect(ruleMatches({ ...user, matchText: 'nope' }, base)).toBe(false);
  });
});
