import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAccounts, useCategories, useTransactionsQuery } from '../../src/api/hooks';
import type { TransactionQuery } from '../../src/api/types';
import { Amount } from '../../src/components/Amount';
import { AppText } from '../../src/components/AppText';
import { CategoryEditSheet } from '../../src/components/CategoryEditSheet';
import { monthLabel } from '../../src/components/MonthSwitcher';
import { Screen } from '../../src/components/Screen';
import { TransactionList } from '../../src/components/TransactionList';
import { statementLabel, sydneyDate } from '../../src/lib/days';
import { now } from '../../src/lib/now';

export default function CategoryScreen() {
  const { id, month, institution, accountId, period } = useLocalSearchParams<{
    id: string;
    month: string;
    institution?: string;
    accountId?: string;
    period?: string;
  }>();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const categories = useCategories().data ?? [];
  const uncategorised = id === 'none';
  const categoryId = uncategorised ? 'none' : Number(id);
  const statement = period === 'statement';
  const query: TransactionQuery = {
    month: month!,
    categoryId,
    ...(institution ? { institution } : {}),
    ...(accountId ? { accountId: Number(accountId) } : {}),
    ...(accountId && statement ? { period: 'statement' as const } : {}),
  };
  const accounts = useAccounts().data?.accounts;
  const account = accountId ? accounts?.find(a => a.id === Number(accountId)) : undefined;
  const txQ = useTransactionsQuery(query);
  const category = uncategorised ? undefined : categories.find(c => c.id === categoryId);
  const transactions = txQ.data?.transactions ?? [];
  // From the server, so it matches the Spending bar: split parts and excluded accounts are counted the same way.
  const total = txQ.data?.totalCents;
  const title = uncategorised ? '? Uncategorised' : category ? `${category.emoji} ${category.name}` : '';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
          <AppText variant="title">‹</AppText>
        </Pressable>
        {category ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Edit category" hitSlop={8} onPress={() => setEditing(true)}>
            <AppText variant="label" tone="muted">
              Edit
            </AppText>
          </Pressable>
        ) : null}
      </View>
      <View style={{ gap: 4 }}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {account ? <AppText tone="muted">{account.displayName ?? account.name}</AppText> : null}
        <AppText tone="muted">{accountId && statement ? statementLabel(month!) : monthLabel(month!)}</AppText>
        {total !== undefined ? <Amount cents={total} variant="hero" /> : null}
      </View>
      {txQ.isError ? <AppText tone="muted">Couldn't load transactions. Pull to try again.</AppText> : null}
      <TransactionList
        transactions={transactions}
        categories={categories}
        today={sydneyDate(now())}
        onPressTxn={t => router.push(`/transaction/${t.id}`)}
        // One account means one bank: the badge would say nothing.
        accounts={accountId ? undefined : accounts}
      />
      {category ? (
        <CategoryEditSheet
          visible={editing}
          category={category}
          categories={categories}
          onClose={() => setEditing(false)}
          onMerged={() => {
            setEditing(false);
            router.back();
          }}
        />
      ) : null}
    </Screen>
  );
}
