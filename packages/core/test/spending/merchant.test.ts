import { it, expect } from 'vitest';
import {
  SEED_CATEGORIES,
  MERCHANTS,
  cleanMerchant,
  merchantCategory,
  mapPocketSmithCategory,
  institutionGroup,
} from '../../src';

const seedNames = new Set(SEED_CATEGORIES.map((c) => c.name));

it('cleans known merchants to canonical names', () => {
  expect(cleanMerchant('WOOLWORTHS 1234 SYDNEY AU Card xx1234')).toBe('Woolworths');
  expect(cleanMerchant('UBER *EATS HELP.UBER.COM')).toBe('Uber Eats');
  expect(cleanMerchant('UBER *TRIP HELP.UBER.COM')).toBe('Uber');
  expect(cleanMerchant('BP 2345 NEWTOWN NSW')).toBe('BP');
});

it('aliases match only at a word boundary', () => {
  expect(cleanMerchant('ATOMIC CAFE NSW')).toBe('Atomic Cafe');
  expect(cleanMerchant('ATOMIC CAFE SYDNEY')).toBe('Atomic Cafe Sydney');
  expect(merchantCategory('Atomic Cafe')).toBeNull();
  expect(cleanMerchant('IGA X-PRESS 123')).toBe('IGA');
});

it('falls back to first 3 words in Title Case', () => {
  expect(cleanMerchant('SQ *CAFE ABC SURRY HILLS NSW')).toBe('Cafe Abc Surry');
});

it('strips prefixes, value date and trailing codes', () => {
  expect(cleanMerchant('VISA DEBIT PURCHASE JOES PIZZA Value Date: 01/02/2026')).toBe('Joes Pizza');
  expect(cleanMerchant('EFTPOS TINY SHOP VIC AUS')).toBe('Tiny Shop');
});

it('returns empty string when nothing is left', () => {
  expect(cleanMerchant('  1234  ')).toBe('');
});

it('maps merchants to categories', () => {
  expect(merchantCategory('Woolworths')).toBe('Groceries');
  expect(merchantCategory('Uber Eats')).toBe('Dining out');
  expect(merchantCategory('Cafe Abc Surry')).toBeNull();
});

it('maps PocketSmith categories', () => {
  expect(mapPocketSmithCategory('Eating Out')).toBe('Dining out');
  expect(mapPocketSmithCategory('Salary')).toBe('Income');
  expect(mapPocketSmithCategory('Weird Thing')).toBeNull();
  expect(mapPocketSmithCategory(null)).toBeNull();
  // A refund reduces its spending category (spec 9.5); it is never income.
  expect(mapPocketSmithCategory('Refunds')).toBeNull();
});

it('groups institutions', () => {
  expect(institutionGroup('Commonwealth Bank of Australia')).toBe('CommBank');
  expect(institutionGroup('American Express')).toBe('Amex');
  expect(institutionGroup('Up')).toBe('Up');
  expect(institutionGroup('ING')).toBe('ING');
});

it('has one income seed category', () => {
  expect(SEED_CATEGORIES.filter((c) => c.kind === 'income').map((c) => c.name)).toEqual(['Income']);
  expect(SEED_CATEGORIES).toHaveLength(21);
});

it('every merchant and map target exists in SEED_CATEGORIES', () => {
  for (const m of MERCHANTS) expect(seedNames.has(m.category), m.name).toBe(true);
  const titles = ['groceries','supermarket','restaurants','dining','eating out','takeaway','fast food','coffee','cafe','transport','fuel','petrol','public transport','parking','tolls','car','shopping','clothing','electronics','general merchandise','utilities','bills','electricity','gas','water','internet','phone','mobile phone','entertainment','movies','music','games','subscriptions','health','medical','pharmacy','doctor','home','household','home improvement','furniture','insurance','personal care','hair','beauty','fitness','gym','education','travel','holidays','accommodation','flights','gifts','donations','charity','pets','fees','bank fees','interest','cash','atm','tax','government','salary','income','wages','interest income'];
  for (const t of titles) {
    const r = mapPocketSmithCategory(t);
    expect(r, t).not.toBeNull();
    expect(seedNames.has(r!), t).toBe(true);
  }
});
