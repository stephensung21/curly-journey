import type { Category, Transaction } from '../api/types';

const FLOW_WORDS: Record<Transaction['flow'], string> = {
  normal: '',
  transfer: 'transfer not spending',
  mortgage: 'mortgage not spending',
  not_spending: 'not spending',
};

/** Everything a search can hit: names, raw text, note, memo, category names (split parts too), the flow label and the dollar amount. */
function haystack(txn: Transaction, categories: Map<number, Category>): string {
  const catIds = [txn.categoryId, ...txn.splits.map(s => s.categoryId)];
  return [
    txn.merchant,
    txn.description,
    txn.note ?? '',
    txn.memo ?? '',
    ...catIds.map(id => (id === null ? '' : (categories.get(id)?.name ?? ''))),
    FLOW_WORDS[txn.flow],
    (Math.abs(txn.amountCents) / 100).toFixed(2),
  ]
    .join(' ')
    .toLowerCase();
}

/** Transactions whose text contains every word of the search, ignoring case. A blank search keeps them all. */
export function searchTransactions(transactions: Transaction[], search: string, categories: Map<number, Category>): Transaction[] {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return transactions;
  return transactions.filter(txn => {
    const text = haystack(txn, categories);
    return words.every(w => text.includes(w));
  });
}
