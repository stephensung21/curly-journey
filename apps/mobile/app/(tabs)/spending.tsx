import { monthKey } from '@curly/core';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useCategories, useSpending, useSyncNow } from '../../src/api/hooks';
import type { SpendingQuery } from '../../src/api/types';
import { Amount } from '../../src/components/Amount';
import { AppText } from '../../src/components/AppText';
import { Card } from '../../src/components/Card';
import { CategoryBar } from '../../src/components/CategoryBar';
import { CrayonUnderline } from '../../src/components/doodles/CrayonUnderline';
import { HandNote } from '../../src/components/doodles/HandNote';
import { MonthSwitcher } from '../../src/components/MonthSwitcher';
import { Screen } from '../../src/components/Screen';
import { now } from '../../src/lib/now';
import { categoryColor } from '../../src/theme/categoryColor';
import { accents } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/useTheme';

const INSTITUTIONS = ['CommBank', 'Amex', 'Up'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NOT_COUNTED = {
  transfer: 'Transfers',
  mortgage: 'Mortgage repayments',
  not_spending: 'Not spending',
} as const;

function prevMonthShort(month: string): string {
  const m = Number(month.slice(5, 7));
  return MONTHS[(m + 10) % 12]!;
}

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
  const categories = useCategories().data ?? [];
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
      await spendingQ.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [sync, spendingQ]);

  const s = spendingQ.data;
  const byId = new Map(categories.map(c => [c.id, c]));
  const max = s ? Math.max(1, ...s.byCategory.map(c => c.cents)) : 1;
  const diff = s ? s.totalCents - s.prevTotalCents : 0;
  const prev = prevMonthShort(month);
  const drill = (id: number | null) =>
    router.push(`/category/${id ?? 'none'}?month=${month}${institution ? `&institution=${institution}` : ''}` as never);
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
        <>
          <View style={{ gap: 2 }}>
            <Amount cents={s.totalCents} variant="hero" />
            <CrayonUnderline width={150} color={accents.orange} />
            {s.prevTotalCents > 0 && diff !== 0 ? (
              <HandNote tone={diff > 0 ? 'pink' : 'lime'}>
                <Amount cents={Math.abs(diff)} decimals="never" inline /> {diff > 0 ? 'more' : 'less'} than {prev}
              </HandNote>
            ) : null}
          </View>

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
              onPress={() => router.push('/inbox' as never)}
              style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.inkMuted, borderRadius: 14, padding: 12 }}
            >
              <AppText variant="bodyStrong">
                {`${s.uncategorisedCount} ${s.uncategorisedCount === 1 ? 'transaction' : 'transactions'} to sort · Sort ›`}
              </AppText>
            </Pressable>
          ) : null}

          {empty ? <AppText tone="muted">No spending this month.</AppText> : null}

          {s.byCategory.length > 0 ? (
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
    </Screen>
  );
}
