import { searchTransactions } from '../src/lib/searchTransactions';
import type { Category, Transaction } from '../src/api/types';

const txn = (over: Partial<Transaction>): Transaction => ({
  id: 1, accountId: 1, date: '2026-10-05', amountCents: -4550, description: 'WOOLWORTHS 1234 SYDNEY', merchant: 'Woolworths',
  status: 'posted', source: 'pocketsmith', categoryId: 1, categorySource: 'auto', flow: 'normal', flowSource: 'auto',
  note: null, memo: null, feedCreatedAt: null, splits: [], ...over,
} as Transaction);
const cats = new Map<number, Category>([
  [1, { id: 1, name: 'Groceries', emoji: '🛒', color: 'lime', kind: 'spending', sort: 1 } as Category],
  [2, { id: 2, name: 'Dining out', emoji: '🍜', color: 'orange', kind: 'spending', sort: 2 } as Category],
]);
const list = [
  txn({ id: 1 }),
  txn({ id: 2, merchant: 'Cafe Sydney', description: 'CAFE SYD', categoryId: 2, amountCents: -1200, note: 'birthday lunch' }),
  txn({ id: 3, merchant: '', description: 'TRANSFER TO SAVINGS', categoryId: null, flow: 'transfer', amountCents: -50000 }),
  txn({ id: 4, merchant: 'Split shop', description: 'SPLIT', categoryId: null, amountCents: -1200, splits: [
    { categoryId: 1, amountCents: -500 }, { categoryId: 2, amountCents: -700 },
  ] as Transaction['splits'] }),
];
const ids = (q: string) => searchTransactions(list, q, cats).map(t => t.id);

it('returns everything for a blank search', () => {
  expect(ids('')).toEqual([1, 2, 3, 4]);
  expect(ids('   ')).toEqual([1, 2, 3, 4]);
});
it('matches merchant, raw description and note, ignoring case', () => {
  expect(ids('woolworths')).toEqual([1]);
  expect(ids('1234')).toEqual([1]);
  expect(ids('BIRTHDAY')).toEqual([2]);
});
it('matches category names, including split parts', () => {
  expect(ids('dining')).toEqual([2, 4]);
});
it('matches the amount in dollars', () => {
  expect(ids('45.50')).toEqual([1]);
  expect(ids('500')).toEqual([3]);
});
it('needs every word to match', () => {
  expect(ids('cafe lunch')).toEqual([2]);
  expect(ids('cafe groceries')).toEqual([]);
});
it('matches the not-spending label words', () => {
  expect(ids('transfer')).toEqual([3]);
});
