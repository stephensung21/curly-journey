import { useMemo } from 'react';
import type { Category, Transaction } from '../api/types';
import { dayHeader } from '../lib/days';
import { AppText } from './AppText';
import { Card } from './Card';
import { TransactionRow } from './TransactionRow';

/** Transactions grouped into one card per day, newest first. */
export function TransactionList({
  transactions,
  categories,
  today,
  onPressTxn,
}: {
  transactions: Transaction[];
  categories: Category[];
  today: string;
  onPressTxn?: (txn: Transaction) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    for (const t of sorted) map.set(t.date, [...(map.get(t.date) ?? []), t]);
    return [...map.entries()];
  }, [transactions]);
  const byId = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  return (
    <>
      {groups.map(([date, rows]) => (
        <Card key={date}>
          <AppText variant="label" tone="muted">
            {dayHeader(date, today)}
          </AppText>
          {rows.map(t => (
            <TransactionRow
              key={t.id}
              txn={t}
              category={t.categoryId === null ? undefined : byId.get(t.categoryId)}
              onPress={onPressTxn ? () => onPressTxn(t) : undefined}
            />
          ))}
        </Card>
      ))}
    </>
  );
}
