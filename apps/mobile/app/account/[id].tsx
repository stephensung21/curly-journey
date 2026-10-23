import { dayMonthLabel, institutionGroup, monthKey } from '@curly/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, type LayoutChangeEvent, Pressable, ScrollView, type ScrollViewInstance, View } from 'react-native';
import { useAccounts, useAccountValues, useCategories, useHoldings, useSetAccountValue, useSpending, useTransactionsQuery } from '../../src/api/hooks';
import type { Account, SpendingQuery } from '../../src/api/types';
import { kindColor, kindEmoji } from '../../src/components/AccountRow';
import { Amount } from '../../src/components/Amount';
import { AppText } from '../../src/components/AppText';
import { Card } from '../../src/components/Card';
import { CategoryBar } from '../../src/components/CategoryBar';
import { CrayonUnderline } from '../../src/components/doodles/CrayonUnderline';
import { IconTile } from '../../src/components/IconTile';
import { MonthSwitcher } from '../../src/components/MonthSwitcher';
import { Button } from '../../src/components/Button';
import { Pill } from '../../src/components/Pill';
import { ValueSheet } from '../../src/components/ValueSheet';
import { OpenBankAppButton } from '../../src/components/OpenBankApp';
import { MoreLessNote } from '../../src/components/MoreLessNote';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { TransactionList } from '../../src/components/TransactionList';
import { plainDay, receivedLabel, statementLabel, sydneyDate } from '../../src/lib/days';
import { now } from '../../src/lib/now';
import { categoryColor } from '../../src/theme/categoryColor';
import { accents } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/useTheme';

const TZ = 'Australia/Sydney';
const PAGES = ['Transactions', 'Categories'] as const;

function Tile({ label, cents, color, signed }: { label: string; cents: number; color: string; signed?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.surface, borderRadius: 14, padding: 10, gap: 2 }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      <Amount cents={cents} signed={signed} style={{ color }} />
    </View>
  );
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

function DetailHeader({ accountId }: { accountId: number }) {
  const router = useRouter();
  return (
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
  );
}

function Title({ account }: { account: Account }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconTile emoji={account.icon ?? kindEmoji[account.kind]} color={kindColor[account.kind]} />
      <AppText variant="title">{account.displayName ?? account.name}</AppText>
    </View>
  );
}

function ManualDetail({ account }: { account: Account }) {
  const today = sydneyDate(now());
  const [editing, setEditing] = useState(false);
  const values = useAccountValues(account.id).data?.values ?? [];
  const setValue = useSetAccountValue();
  return (
    <Screen>
      <DetailHeader accountId={account.id} />
      <Title account={account} />
      <Card style={{ gap: 6 }}>
        <Amount cents={account.balanceCents} variant="hero" />
        {account.balanceDate ? (
          <AppText variant="label" tone="muted">
            {`as of ${dayMonthLabel(account.balanceDate)}`}
          </AppText>
        ) : null}
        {account.needsUpdate ? <Pill tone="warn">Time to update</Pill> : null}
      </Card>
      <Button label="Update value" onPress={() => setEditing(true)} />
      <AppText variant="label" tone="muted">
        History
      </AppText>
      <Card style={{ gap: 10 }}>
        {values.map(v => (
          <View key={v.asOf} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText>{dayMonthLabel(v.asOf)}</AppText>
            <Amount cents={v.valueCents} decimals="never" />
          </View>
        ))}
      </Card>
      <ValueSheet
        visible={editing}
        onClose={() => setEditing(false)}
        today={today}
        saving={setValue.isPending}
        onSave={async (valueCents, asOf) => {
          await setValue.mutateAsync({ id: account.id, valueCents, asOf });
        }}
      />
    </Screen>
  );
}

function CoinSpotDetail({ account }: { account: Account }) {
  const holdings = useHoldings(account.id).data?.holdings ?? [];
  return (
    <Screen>
      <DetailHeader accountId={account.id} />
      <Title account={account} />
      <Amount cents={account.balanceCents} variant="hero" />
      <Card style={{ gap: 12 }}>
        {holdings.map(h => (
          <View key={h.symbol} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconTile emoji={h.symbol.slice(0, 1)} color={accents.orange} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{h.symbol}</AppText>
              <AppText variant="label" tone="muted">
                {h.units}
              </AppText>
            </View>
            <Amount cents={h.audCents} />
          </View>
        ))}
      </Card>
      {account.syncedAt ? (
        <AppText variant="label" tone="muted">
          {`Values from CoinSpot · updated ${receivedLabel(account.syncedAt)}`}
        </AppText>
      ) : null}
    </Screen>
  );
}

function BankDetail({ accountId }: { accountId: number }) {
  const router = useRouter();
  const t = useTheme();
  const current = now();
  const [month, setMonth] = useState(() => monthKey(current));
  const [view, setView] = useState<'calendar' | 'statement'>('calendar');
  const [page, setPage] = useState(0);
  const [width, setWidth] = useState(() => Dimensions.get('window').width - 32);
  const pager = useRef<ScrollViewInstance>(null);
  useEffect(() => setView('calendar'), [accountId]);

  const accountsQ = useAccounts();
  const account = accountsQ.data?.accounts.find(a => a.id === accountId);
  const isAmex = !!account && institutionGroup(account.institution) === 'Amex';
  const statement = isAmex && view === 'statement';
  const query: SpendingQuery = statement ? { month, accountId, period: 'statement' } : { month, accountId };
  const txQ = useTransactionsQuery(query);
  const spendingQ = useSpending(query);
  const categories = useCategories().data ?? [];
  const byId = new Map(categories.map(c => [c.id, c]));
  const s = spendingQ.data;
  const max = s ? Math.max(1, ...s.byCategory.map(c => c.cents)) : 1;

  const synced = syncedLabel(accountsQ.data?.lastSuccessAt ?? null, current);
  const today = sydneyDate(current);

  const transactions = txQ.data?.transactions ?? [];
  const loaded = !!txQ.data;
  const inCents = transactions.reduce((n, x) => (x.amountCents > 0 ? n + x.amountCents : n), 0);
  const outCents = transactions.reduce((n, x) => (x.amountCents < 0 ? n + x.amountCents : n), 0);
  const change = inCents + outCents;

  const goTo = (i: number) => {
    setPage(i);
    pager.current?.scrollTo({ x: i * width, animated: true });
  };

  return (
    <Screen>
      <DetailHeader accountId={accountId} />

      {account ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconTile emoji={kindEmoji[account.kind]} color={kindColor[account.kind]} />
            <AppText variant="title">{account.displayName ?? account.name}</AppText>
          </View>
          <Amount cents={account.balanceCents} variant="hero" />
          <OpenBankAppButton institution={account.institution} />
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

      {loaded ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Tile label="In" cents={inCents} color={t.noteLime} signed />
          <Tile label="Out" cents={outCents} color={t.negative} />
          <Tile label="Change" cents={change} color={change >= 0 ? t.noteLime : t.negative} signed />
        </View>
      ) : null}

      {isAmex ? (
        <Segmented
          options={[
            { value: 'calendar' as const, label: 'Calendar month' },
            { value: 'statement' as const, label: 'Statement' },
          ]}
          value={view}
          onChange={setView}
        />
      ) : null}
      <MonthSwitcher value={month} onChange={setMonth} />
      {statement ? (
        <AppText tone="muted" style={{ textAlign: 'center' }}>
          {statementLabel(month)}
        </AppText>
      ) : null}

      {s ? (
        <View style={{ gap: 2 }}>
          <AppText variant="label" tone="muted">
            Spent
          </AppText>
          <Amount cents={s.totalCents} variant="hero" />
          <CrayonUnderline width={150} color={accents.orange} />
          <MoreLessNote month={month} totalCents={s.totalCents} prevTotalCents={s.prevTotalCents} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 20 }}>
        {PAGES.map((label, i) => (
          <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: page === i }} onPress={() => goTo(i)}>
            <AppText variant={page === i ? 'bodyStrong' : 'body'} tone={page === i ? 'ink' : 'muted'}>
              {label}
            </AppText>
            {page === i ? <CrayonUnderline width={label.length * 9} color={accents.lime} seed={i + 3} /> : <View style={{ height: 14 }} />}
          </Pressable>
        ))}
      </View>

      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        <ScrollView
          ref={pager}
          testID="account-pager"
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          <View style={{ width, gap: 10 }}>
            {txQ.isError ? <AppText tone="muted">Couldn't load transactions. Pull to try again.</AppText> : null}
            {transactions.length === 0 && !txQ.isLoading && !txQ.isError ? <AppText tone="muted">No transactions this month.</AppText> : null}
            <TransactionList transactions={transactions} categories={categories} today={today} onPressTxn={x => router.push(`/transaction/${x.id}`)} />
          </View>
          <View style={{ width, gap: 10 }}>
            {s && s.byCategory.length > 0 ? (
              <Card style={{ gap: 12 }}>
                {s.byCategory.map(c => {
                  const cat = c.categoryId === null ? undefined : byId.get(c.categoryId);
                  return (
                    <CategoryBar
                      key={c.categoryId ?? 'none'}
                      emoji={c.categoryId === null ? '?' : (cat?.emoji ?? '?')}
                      color={c.categoryId === null ? t.line : cat ? categoryColor(cat.color, t) : t.line}
                      name={c.categoryId === null ? 'Uncategorised' : (cat?.name ?? 'Unknown')}
                      cents={c.cents}
                      fraction={c.cents / max}
                      onPress={() => router.push(`/category/${c.categoryId ?? 'none'}?month=${month}&accountId=${accountId}${statement ? '&period=statement' : ''}` as never)}
                    />
                  );
                })}
              </Card>
            ) : s ? (
              <AppText tone="muted">No spending this month.</AppText>
            ) : null}
          </View>
        </ScrollView>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {PAGES.map((label, i) => (
          <View key={label} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: page === i ? accents.lime : t.line }} />
        ))}
      </View>
    </Screen>
  );
}

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = Number(id);
  const account = useAccounts().data?.accounts.find(a => a.id === accountId);
  if (account?.source === 'manual') return <ManualDetail account={account} />;
  if (account?.source === 'coinspot') return <CoinSpotDetail account={account} />;
  return <BankDetail accountId={accountId} />;
}
