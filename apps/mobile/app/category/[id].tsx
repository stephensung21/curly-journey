import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useCategories, useTransactionsQuery } from '../../src/api/hooks';
import type { TransactionQuery } from '../../src/api/types';
import { Amount } from '../../src/components/Amount';
import { AppText } from '../../src/components/AppText';
import { monthLabel } from '../../src/components/MonthSwitcher';
import { Screen } from '../../src/components/Screen';
import { TransactionList } from '../../src/components/TransactionList';
import { sydneyDate } from '../../src/lib/days';
import { now } from '../../src/lib/now';

export default function CategoryScreen() {
  const { id, month, institution } = useLocalSearchParams<{ id: string; month: string; institution?: string }>();
  const router = useRouter();
  const categories = useCategories().data ?? [];
  const uncategorised = id === 'none';
  const categoryId = uncategorised ? 'none' : Number(id);
  const query: TransactionQuery = { month: month!, categoryId, ...(institution ? { institution } : {}) };
  const txQ = useTransactionsQuery(query);
  const category = uncategorised ? undefined : categories.find(c => c.id === categoryId);
  const transactions = txQ.data?.transactions ?? [];
  const total = -transactions.filter(t => t.flow === 'normal').reduce((sum, t) => sum + t.amountCents, 0);
  const title = uncategorised ? '? Uncategorised' : category ? `${category.emoji} ${category.name}` : '';

  return (
    <Screen>
      <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
        <AppText variant="title">‹</AppText>
      </Pressable>
      <View style={{ gap: 4 }}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        <AppText tone="muted">{monthLabel(month!)}</AppText>
        <Amount cents={total} variant="hero" />
      </View>
      {txQ.isError ? <AppText tone="muted">Couldn't load transactions. Pull to try again.</AppText> : null}
      <TransactionList
        transactions={transactions}
        categories={categories}
        today={sydneyDate(now())}
        onPressTxn={t => router.push(`/transaction/${t.id}`)}
      />
    </Screen>
  );
}
