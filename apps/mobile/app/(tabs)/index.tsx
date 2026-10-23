import { institutionGroup, limitMessage, monthKey, WHOLE_MONTH_LABEL } from '@curly/core';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { useAccounts, useCategories, useDaily, useInOut, useLimits, useReorderAccounts, useSpending, useSyncNow, useSyncStatus } from '../../src/api/hooks';
import type { Account } from '../../src/api/types';
import { AccountRow, kindColor, kindEmoji } from '../../src/components/AccountRow';
import { BankLogo } from '../../src/components/BankLogo';
import { Amount } from '../../src/components/Amount';
import { AppText } from '../../src/components/AppText';
import { Card } from '../../src/components/Card';
import { Chip } from '../../src/components/Chip';
import { CrayonUnderline } from '../../src/components/doodles/CrayonUnderline';
import { SunDoodle } from '../../src/components/doodles/SunDoodle';
import { HeroCard } from '../../src/components/HeroCard';
import { InOutChart } from '../../src/components/InOutChart';
import { OpenBankAppLink } from '../../src/components/OpenBankApp';
import { IconTile } from '../../src/components/IconTile';
import { Screen } from '../../src/components/Screen';
import { SortableList } from '../../src/components/SortableList';
import { SyncBanner } from '../../src/components/SyncBanner';
import { UpcomingEvents } from '../../src/components/UpcomingEvents';
import { moveItem } from '../../src/lib/moveItem';
import { now } from '../../src/lib/now';
import { useSettings } from '../../src/settings/store';
import { useTheme } from '../../src/theme/useTheme';

const ORDER = ['CommBank', 'Amex', 'Up', 'CommSec', 'CoinSpot', 'Manual'];

/** Saved bank order first, then the fixed ORDER (by bank group, so "American Express" ranks as Amex), then A to Z. */
function groupAccounts(accounts: Account[], bankOrder: string[] = []): [string, Account[]][] {
  const map = new Map<string, Account[]>();
  for (const a of accounts) map.set(a.institution, [...(map.get(a.institution) ?? []), a]);
  const saved = (n: string) => (bankOrder.includes(n) ? bankOrder.indexOf(n) : bankOrder.length);
  const rank = (n: string) => (ORDER.includes(institutionGroup(n)) ? ORDER.indexOf(institutionGroup(n)) : ORDER.length);
  return [...map.entries()].sort(([a], [b]) => saved(a) - saved(b) || rank(a) - rank(b) || a.localeCompare(b));
}

const ROW_HEIGHT = 52;

function useArrowStyle() {
  const t = useTheme();
  return { width: 32, height: 32, borderRadius: 16, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' } as const;
}

function ReorderRow({ account, handle, onUp, onDown }: { account: Account; handle: ReactElement; onUp?: () => void; onDown?: () => void }) {
  const arrow = useArrowStyle();
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
  const bankOrder = useSettings(s => s.bankOrder);
  const setBankOrder = useSettings(s => s.setBankOrder);
  const arrow = useArrowStyle();
  const router = useRouter();
  const spendingQ = useSpending({ month });
  const limits = useLimits(month).data?.limits ?? [];
  const categoryNames = new Map((useCategories().data ?? []).map(c => [c.id, c.name]));
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

  const warned = limits.filter(l => l.level !== 'ok').sort((a, b) => b.percent - a.percent);
  const top = warned[0];
  const chipText = top
    ? limitMessage(top.categoryId === null ? WHOLE_MONTH_LABEL : (categoryNames.get(top.categoryId) ?? 'A category'), top.percent) +
      (warned.length > 1 ? ` · +${warned.length - 1} more` : '')
    : null;

  const shown = draft ?? groupAccounts(accounts, bankOrder);
  const idsOf = (groups: [string, Account[]][]) => groups.flatMap(([, rows]) => rows.map(a => a.id));
  const startEditing = () => setDraft(groupAccounts(accounts, bankOrder));
  const finishEditing = () => {
    if (draft) {
      const ids = idsOf(draft);
      // Compare in the draft's bank order: moving a whole bank is saved on its own, not as an account reorder.
      const before = idsOf(draft.map(([name]) => groupAccounts(accounts).find(([n]) => n === name)!));
      if (ids.some((id, i) => id !== before[i])) reorder.mutate(ids);
    }
    setDraft(null);
  };
  const setGroup = (institution: string, rows: Account[]) =>
    setDraft(d => (d ? d.map(([name, old]) => (name === institution ? [name, rows] : [name, old])) : d));

  const moveBank = (from: number, to: number) => {
    if (!draft) return;
    const next = moveItem(draft, from, to);
    setDraft(next);
    setBankOrder(next.map(([name]) => name));
  };

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
        {chipText ? (
          <View style={{ marginTop: 8, alignItems: 'flex-start' }}>
            <Chip label={chipText} onPress={() => router.push('/limits')} />
          </View>
        ) : null}
        <View style={{ marginTop: 10 }}>
          {homeChart === 'sixMonths' ? (
            <InOutChart mode="sixMonths" data={inOutQ.data ?? []} hideBalances={hideBalances} onHero />
          ) : (
            <InOutChart mode="thisMonth" data={dailyQ.data ?? []} daysInMonth={daysIn(month)} hideBalances={hideBalances} onHero />
          )}
        </View>
      </HeroCard>
      <UpcomingEvents />
      {accounts.length === 0 && !accountsQ.isLoading ? (
        <AppText tone="muted">No accounts yet. Connect PocketSmith in the backend, then pull to refresh.</AppText>
      ) : null}
      {shown.map(([institution, rows], groupIndex) => (
        <Card key={institution}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <BankLogo institution={institution} />
              <AppText variant="label" tone="muted">
                {institution}
              </AppText>
              <OpenBankAppLink institution={institution} />
            </View>
            {draft && groupIndex > 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Move bank up" accessibilityHint={institution} onPress={() => moveBank(groupIndex, groupIndex - 1)} hitSlop={4} style={arrow}>
                <AppText>↑</AppText>
              </Pressable>
            ) : null}
            {draft && groupIndex < shown.length - 1 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Move bank down" accessibilityHint={institution} onPress={() => moveBank(groupIndex, groupIndex + 1)} hitSlop={4} style={arrow}>
                <AppText>↓</AppText>
              </Pressable>
            ) : null}
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
      {draft ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/account/new')}
          style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.inkMuted, borderRadius: 14, padding: 12, alignItems: 'center' }}
        >
          <AppText tone="muted">+ Add super or home value</AppText>
        </Pressable>
      )}
    </Screen>
  );
}
