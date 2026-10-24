import { limitMessage, monthKey, WHOLE_MONTH_LABEL } from '@curly/core';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Dimensions, type LayoutChangeEvent, Pressable, RefreshControl, ScrollView, type ScrollViewInstance, TextInput, View } from 'react-native';
import { useCategories, useLimits, useSpending, useSyncNow, useTransactionsQuery } from '../../src/api/hooks';
import type { SpendingQuery } from '../../src/api/types';
import { Amount } from '../../src/components/Amount';
import { AppText, fonts } from '../../src/components/AppText';
import { Card } from '../../src/components/Card';
import { CategoryBar } from '../../src/components/CategoryBar';
import { CrayonUnderline } from '../../src/components/doodles/CrayonUnderline';
import { MoreLessNote } from '../../src/components/MoreLessNote';
import { MonthSwitcher } from '../../src/components/MonthSwitcher';
import { Screen } from '../../src/components/Screen';
import { TransactionList } from '../../src/components/TransactionList';
import { sydneyDate } from '../../src/lib/days';
import { now } from '../../src/lib/now';
import { searchTransactions } from '../../src/lib/searchTransactions';
import { categoryColor } from '../../src/theme/categoryColor';
import { accents } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/useTheme';

const INSTITUTIONS = ['CommBank', 'Amex', 'Up'];
const PAGES = ['Categories', 'Transactions'] as const;
const NOT_COUNTED = {
  transfer: 'Transfers',
  mortgage: 'Mortgage repayments',
  not_spending: 'Not spending',
} as const;

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ backgroundColor: selected ? accents.orange : t.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}
    >
      <AppText variant={selected ? 'bodyStrong' : 'body'} tone={selected ? 'onAccent' : 'ink'} style={{ fontSize: 13 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export default function SpendingScreen() {
  const t = useTheme();
  const router = useRouter();
  const [month, setMonth] = useState(() => monthKey(now()));
  const [institution, setInstitution] = useState<string | undefined>(undefined);
  const query: SpendingQuery = institution ? { month, institution } : { month };
  const spendingQ = useSpending(query);
  // Same scope as the total: accounts that count towards spending, every flow, labelled by the row.
  const txQ = useTransactionsQuery(query);
  const categories = useCategories().data ?? [];
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [width, setWidth] = useState(() => Dimensions.get('window').width - 32);
  const pager = useRef<ScrollViewInstance>(null);
  const limitsQ = useLimits(month);
  const sync = useSyncNow();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await sync.mutateAsync();
    } catch {
      // A failed sync still refetches what we have.
    }
    try {
      await Promise.all([spendingQ.refetch(), txQ.refetch?.()]);
    } finally {
      setRefreshing(false);
    }
  }, [sync, spendingQ, txQ]);

  const s = spendingQ.data;
  const byId = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const allTxns = txQ.data?.transactions ?? [];
  const shownTxns = useMemo(() => searchTransactions(allTxns, search, byId), [allTxns, search, byId]);
  const goTo = (i: number) => {
    setPage(i);
    pager.current?.scrollTo({ x: i * width, animated: true });
  };
  // Limits only apply to the whole picture, not to a single institution's slice.
  const limits = institution ? [] : (limitsQ.data?.limits ?? []);
  const limitByCategory = new Map(limits.filter(l => l.categoryId !== null).map(l => [l.categoryId, l]));
  const shownLimits = s ? s.byCategory.flatMap(c => limitByCategory.get(c.categoryId) ?? []) : [];
  const max = s ? Math.max(1, ...s.byCategory.map(c => c.cents), ...shownLimits.map(l => l.amountCents)) : 1;
  const nameOf = (categoryId: number | null) => (categoryId === null ? WHOLE_MONTH_LABEL : (byId.get(categoryId)?.name ?? 'Unknown'));
  const warnings = limits.filter(l => l.level !== 'ok').sort((a, b) => b.percent - a.percent);
  const drill = (id: number | null) =>
    router.push(
      `/category/${id ?? 'none'}?month=${month}${institution ? `&institution=${encodeURIComponent(institution)}` : ''}` as never,
    );
  const notCounted = (s?.notCounted ?? []).filter(n => n.count > 0);
  const empty = s && s.totalCents === 0 && s.byCategory.length === 0;

  return (
    <Screen testID="spending-scroll" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <AppText variant="title">Spending</AppText>
      <MonthSwitcher value={month} onChange={setMonth} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip label="All" selected={!institution} onPress={() => setInstitution(undefined)} />
        {INSTITUTIONS.map(i => (
          <Chip key={i} label={i} selected={institution === i} onPress={() => setInstitution(i)} />
        ))}
      </View>

      {spendingQ.isError ? <AppText tone="muted">Couldn't load spending. Pull to try again.</AppText> : null}

      {s ? (
        <View style={{ gap: 2 }}>
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
          testID="spending-pager"
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onMomentumScrollEnd={e => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          <View style={{ width, gap: 14 }}>
            {s ? (
              <>
                {warnings.map(l => (
                  <AppText key={l.id}>{limitMessage(nameOf(l.categoryId), l.percent)}</AppText>
                ))}

                {s.byInstitution.length > 0 ? (
                  <AppText tone="muted">
                    {s.byInstitution.map((b, i) => (
                      <AppText key={b.institution} tone="muted">
                        {i > 0 ? ' · ' : ''}
                        {b.institution} <Amount cents={b.cents} decimals="never" inline />
                      </AppText>
                    ))}
                  </AppText>
                ) : null}

                {s.uncategorisedCount > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/inbox')}
                    style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.inkMuted, borderRadius: 14, padding: 12 }}
                  >
                    <AppText variant="bodyStrong">
                      {`${s.uncategorisedCount} to sort this month · Sort ›`}
                    </AppText>
                  </Pressable>
                ) : null}

                {empty ? <AppText tone="muted">No spending this month.</AppText> : null}

                {s.byCategory.length > 0 ? (
                  <Card style={{ gap: 12 }}>
                    {s.byCategory.map(c => {
                      const cat = c.categoryId === null ? undefined : byId.get(c.categoryId);
                      const limit = limitByCategory.get(c.categoryId);
                      return (
                        <CategoryBar
                          key={c.categoryId ?? 'none'}
                          emoji={c.categoryId === null ? '?' : (cat?.emoji ?? '?')}
                          color={c.categoryId === null ? t.line : cat ? categoryColor(cat.color, t) : t.line}
                          name={c.categoryId === null ? 'Uncategorised' : (cat?.name ?? 'Unknown')}
                          cents={c.cents}
                          fraction={c.cents / max}
                          limitFraction={limit ? limit.amountCents / max : undefined}
                          onPress={() => drill(c.categoryId)}
                        />
                      );
                    })}
                  </Card>
                ) : null}

                {notCounted.length > 0 ? (
                  <Card style={{ gap: 8 }}>
                    <AppText variant="label" tone="muted">
                      Not counted as spending
                    </AppText>
                    {notCounted.map(n => (
                      <View key={n.flow} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <AppText>{NOT_COUNTED[n.flow]}</AppText>
                        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                          <AppText tone="muted">{n.count}</AppText>
                          <Amount cents={n.cents} decimals="never" />
                        </View>
                      </View>
                    ))}
                  </Card>
                ) : null}
              </>
            ) : null}
          </View>
          <View style={{ width, gap: 10 }}>
            <TextInput
              accessibilityLabel="Search transactions"
              placeholder="Search merchant, category, note or amount"
              placeholderTextColor={t.inkFaded}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              style={{ backgroundColor: t.surface, color: t.ink, fontFamily: fonts.medium, fontSize: 14, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
            />
            {txQ.isError ? <AppText tone="muted">Couldn't load transactions. Pull to try again.</AppText> : null}
            {txQ.data && allTxns.length === 0 ? <AppText tone="muted">No transactions this month.</AppText> : null}
            {allTxns.length > 0 && shownTxns.length === 0 ? <AppText tone="muted">{`No transactions match "${search.trim()}".`}</AppText> : null}
            <TransactionList
              transactions={shownTxns}
              categories={categories}
              today={sydneyDate(now())}
              onPressTxn={x => router.push(`/transaction/${x.id}`)}
            />
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
