import { monthKey } from '@curly/core';
import { useCallback, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { useAccounts, useDaily, useInOut, useReorderAccounts, useSpending, useSyncNow, useSyncStatus } from '../../src/api/hooks';
import type { Account } from '../../src/api/types';
import { AccountRow, kindColor, kindEmoji } from '../../src/components/AccountRow';
import { Amount } from '../../src/components/Amount';
import { AppText } from '../../src/components/AppText';
import { Card } from '../../src/components/Card';
import { CrayonUnderline } from '../../src/components/doodles/CrayonUnderline';
import { SunDoodle } from '../../src/components/doodles/SunDoodle';
import { HeroCard } from '../../src/components/HeroCard';
import { InOutChart } from '../../src/components/InOutChart';
import { OpenBankAppLink } from '../../src/components/OpenBankApp';
import { IconTile } from '../../src/components/IconTile';
import { Screen } from '../../src/components/Screen';
import { SortableList } from '../../src/components/SortableList';
import { SyncBanner } from '../../src/components/SyncBanner';
import { moveItem } from '../../src/lib/moveItem';
import { now } from '../../src/lib/now';
import { useSettings } from '../../src/settings/store';
import { useTheme } from '../../src/theme/useTheme';

const ORDER = ['CommBank', 'Amex', 'Up', 'CommSec'];

function groupAccounts(accounts: Account[]): [string, Account[]][] {
  const map = new Map<string, Account[]>();
  for (const a of accounts) map.set(a.institution, [...(map.get(a.institution) ?? []), a]);
  const rank = (n: string) => (ORDER.includes(n) ? ORDER.indexOf(n) : ORDER.length);
  return [...map.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

const ROW_HEIGHT = 52;

function ReorderRow({ account, handle, onUp, onDown }: { account: Account; handle: ReactElement; onUp?: () => void; onDown?: () => void }) {
  const t = useTheme();
  const arrow = { width: 32, height: 32, borderRadius: 16, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <View style={{ height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {handle}
      <IconTile emoji={account.icon ?? kindEmoji[account.kind]} color={kindColor[account.kind]} />
      <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
        {account.displayName ?? account.name}
      </AppText>
      {onUp ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Move up" accessibilityHint={account.displayName ?? account.name} onPress={onUp} hitSlop={4} style={arrow}>
          <AppText>↑</AppText>
        </Pressable>
      ) : null}
      {onDown ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Move down" accessibilityHint={account.displayName ?? account.name} onPress={onDown} hitSlop={4} style={arrow}>
          <AppText>↓</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function sydneyWeekday(iso: string | null): string {
  if (!iso) return 'a while';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Australia/Sydney' });
}

function daysIn(month: string): number {
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
}

export default function AccountsScreen() {
  const t = useTheme();
  const month = monthKey(now());
  const homeChart = useSettings(s => s.homeChart);
  const hideBalances = useSettings(s => s.hideBalances);
  const spendingQ = useSpending({ month });
  const inOutQ = useInOut(month, 6);
  const dailyQ = useDaily(month);
  const accountsQ = useAccounts();
  const statusQ = useSyncStatus();
  const sync = useSyncNow();
  const reorder = useReorderAccounts();
  // Reorder mode: the groups in display order, edited locally until Done.
  const [draft, setDraft] = useState<[string, Account[]][] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState(false);

  // One flow for the Refresh button and pull-to-refresh; a second call while running is ignored.
  const onRefresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    setError(false);
    try {
      await sync.mutateAsync();
    } catch {
      setError(true);
    }
    try {
      await Promise.all([accountsQ.refetch(), statusQ.refetch()]);
    } finally {
      running.current = false;
      setRefreshing(false);
    }
  }, [sync, accountsQ, statusQ]);

  const accounts = accountsQ.data?.accounts ?? [];
  const lastSuccessAt = statusQ.data?.lastSuccessAt ?? accountsQ.data?.lastSuccessAt ?? null;
  const firstStale = accounts.find(a => a.stale && a.countsSpending);
  const bannerText =
    statusQ.data?.lastStatus === 'failed'
      ? 'Sync failed ·'
      : firstStale
        ? lastSuccessAt
          ? `${firstStale.institution} hasn't updated since ${sydneyWeekday(lastSuccessAt)}`
          : `${firstStale.institution} hasn't updated recently`
        : null;

  const shown = draft ?? groupAccounts(accounts);
  const idsOf = (groups: [string, Account[]][]) => groups.flatMap(([, rows]) => rows.map(a => a.id));
  const startEditing = () => setDraft(groupAccounts(accounts));
  const finishEditing = () => {
    if (draft) {
      const ids = idsOf(draft);
      const before = idsOf(groupAccounts(accounts));
      if (ids.some((id, i) => id !== before[i])) reorder.mutate(ids);
    }
    setDraft(null);
  };
  const setGroup = (institution: string, rows: Account[]) =>
    setDraft(d => (d ? d.map(([name, old]) => (name === institution ? [name, rows] : [name, old])) : d));

  return (
    <Screen testID="accounts-scroll" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <AppText variant="title">Accounts</AppText>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={draft ? finishEditing : startEditing}>
            <AppText variant="label" tone="muted">
              {draft ? 'Done' : 'Edit order'}
            </AppText>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <SunDoodle />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh"
            disabled={refreshing}
            onPress={() => void onRefresh()}
            hitSlop={8}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}
          >
            {refreshing ? <ActivityIndicator size="small" color={t.ink} /> : <AppText variant="title">↻</AppText>}
          </Pressable>
        </View>
      </View>
      {refreshing ? <AppText tone="muted">Syncing…</AppText> : null}
      {bannerText ? <SyncBanner text={bannerText} /> : null}
      {error ? <AppText tone="muted">Sync failed. Try again soon.</AppText> : null}
      <HeroCard>
        <AppText variant="label" tone="onAccent">
          You've spent this month
        </AppText>
        <Amount cents={spendingQ.data?.totalCents ?? 0} variant="hero" tone="onAccent" />
        <CrayonUnderline width={150} color={t.inkOnAccent} />
        <View style={{ marginTop: 10 }}>
          {homeChart === 'sixMonths' ? (
            <InOutChart mode="sixMonths" data={inOutQ.data ?? []} hideBalances={hideBalances} onHero />
          ) : (
            <InOutChart mode="thisMonth" data={dailyQ.data ?? []} daysInMonth={daysIn(month)} hideBalances={hideBalances} onHero />
          )}
        </View>
      </HeroCard>
      {accounts.length === 0 && !accountsQ.isLoading ? (
        <AppText tone="muted">No accounts yet. Connect PocketSmith in the backend, then pull to refresh.</AppText>
      ) : null}
      {shown.map(([institution, rows]) => (
        <Card key={institution}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppText variant="label" tone="muted">
              {institution}
            </AppText>
            <OpenBankAppLink institution={institution} />
          </View>
          {draft ? (
            <SortableList
              items={rows}
              keyOf={a => a.id}
              onReorder={next => setGroup(institution, next)}
              renderItem={(a, { index, handle }) => (
                <ReorderRow
                  account={a}
                  handle={handle}
                  onUp={index > 0 ? () => setGroup(institution, moveItem(rows, index, index - 1)) : undefined}
                  onDown={index < rows.length - 1 ? () => setGroup(institution, moveItem(rows, index, index + 1)) : undefined}
                />
              )}
            />
          ) : (
            rows.map(a => <AccountRow key={a.id} account={a} lastSuccessAt={lastSuccessAt} />)
          )}
        </Card>
      ))}
    </Screen>
  );
}
