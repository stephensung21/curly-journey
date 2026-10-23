import { monthKey } from '@curly/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAccounts, useTransactions } from '../../src/api/hooks';
import type { Transaction } from '../../src/api/types';
import { kindColor, kindEmoji } from '../../src/components/AccountRow';
import { Amount } from '../../src/components/Amount';
import { AppText } from '../../src/components/AppText';
import { Card } from '../../src/components/Card';
import { IconTile } from '../../src/components/IconTile';
import { MonthSwitcher } from '../../src/components/MonthSwitcher';
import { Screen } from '../../src/components/Screen';
import { TransactionRow } from '../../src/components/TransactionRow';
import { now } from '../../src/lib/now';

const TZ = 'Australia/Sydney';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Sydney calendar date (YYYY-MM-DD) of an instant. */
function sydneyDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

function plainDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]}`;
}

function dayBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

export function dayHeader(iso: string, today: string): string {
  if (iso === today) return `Today · ${plainDay(iso)}`;
  if (iso === dayBefore(today)) return `Yesterday · ${plainDay(iso)}`;
  return plainDay(iso);
}

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

  const account = accountsQ.data?.accounts.find(a => a.id === accountId);
  const synced = syncedLabel(accountsQ.data?.lastSuccessAt ?? null, current);
  const today = sydneyDate(current);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    const sorted = [...(txQ.data?.transactions ?? [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    for (const t of sorted) map.set(t.date, [...(map.get(t.date) ?? []), t]);
    return [...map.entries()];
  }, [txQ.data]);

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

      {groups.length === 0 && !txQ.isLoading ? <AppText tone="muted">No transactions this month.</AppText> : null}
      {groups.map(([date, rows]) => (
        <Card key={date}>
          <AppText variant="label" tone="muted">
            {dayHeader(date, today)}
          </AppText>
          {rows.map(t => (
            <TransactionRow key={t.id} txn={t} />
          ))}
        </Card>
      ))}
    </Screen>
  );
}
