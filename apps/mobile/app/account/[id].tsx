import { monthKey } from '@curly/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAccounts, useCategories, useTransactions } from '../../src/api/hooks';
import { kindColor, kindEmoji } from '../../src/components/AccountRow';
import { Amount } from '../../src/components/Amount';
import { AppText } from '../../src/components/AppText';
import { IconTile } from '../../src/components/IconTile';
import { MonthSwitcher } from '../../src/components/MonthSwitcher';
import { Screen } from '../../src/components/Screen';
import { TransactionList } from '../../src/components/TransactionList';
import { plainDay, sydneyDate } from '../../src/lib/days';
import { now } from '../../src/lib/now';

const TZ = 'Australia/Sydney';

function syncedLabel(iso: string | null, current: Date): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (sydneyDate(at) === sydneyDate(current)) {
    const time = at
      .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ })
      .replace(/\s/g, '')
      .toLowerCase();
    return `synced ${time}`;
  }
  return `synced ${plainDay(sydneyDate(at))}`;
}

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = Number(id);
  const router = useRouter();
  const current = now();
  const [month, setMonth] = useState(() => monthKey(current));
  const accountsQ = useAccounts();
  const txQ = useTransactions(accountId, month);
  const categories = useCategories().data ?? [];

  const account = accountsQ.data?.accounts.find(a => a.id === accountId);
  const synced = syncedLabel(accountsQ.data?.lastSuccessAt ?? null, current);
  const today = sydneyDate(current);

  const transactions = txQ.data?.transactions ?? [];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
          <AppText variant="title">‹</AppText>
        </Pressable>
        <Pressable
          accessibilityLabel="Account settings"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push(`/account/${accountId}/settings`)}
        >
          <AppText variant="title">⚙</AppText>
        </Pressable>
      </View>

      {account ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconTile emoji={kindEmoji[account.kind]} color={kindColor[account.kind]} />
            <AppText variant="title">{account.displayName ?? account.name}</AppText>
          </View>
          <Amount cents={account.balanceCents} variant="hero" />
          {synced ? (
            <AppText variant="label" tone="muted">
              {synced}
            </AppText>
          ) : null}
          {account.isOffset ? (
            <AppText variant="label" tone="muted">
              Offset · home loan
            </AppText>
          ) : null}
        </View>
      ) : null}

      <MonthSwitcher value={month} onChange={setMonth} />

      {txQ.isError ? <AppText tone="muted">Couldn't load transactions. Pull to try again.</AppText> : null}
      {transactions.length === 0 && !txQ.isLoading && !txQ.isError ? <AppText tone="muted">No transactions this month.</AppText> : null}
      <TransactionList transactions={transactions} categories={categories} today={today} />
    </Screen>
  );
}
