import { limitMessage, monthKey, WHOLE_MONTH_LABEL } from '@curly/core';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useCategories, useLimits, useSpending, useSyncNow } from '../../src/api/hooks';
import type { SpendingQuery } from '../../src/api/types';
import { Amount } from '../../src/components/Amount';
import { AppText } from '../../src/components/AppText';
import { Card } from '../../src/components/Card';
import { CategoryBar } from '../../src/components/CategoryBar';
import { CrayonUnderline } from '../../src/components/doodles/CrayonUnderline';
import { MoreLessNote } from '../../src/components/MoreLessNote';
import { MonthSwitcher } from '../../src/components/MonthSwitcher';
import { Screen } from '../../src/components/Screen';
import { now } from '../../src/lib/now';
import { categoryColor } from '../../src/theme/categoryColor';
import { accents } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/useTheme';

const INSTITUTIONS = ['CommBank', 'Amex', 'Up'];
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
  const categories = useCategories().data ?? [];
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
      await spendingQ.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [sync, spendingQ]);

  const s = spendingQ.data;
  const byId = new Map(categories.map(c => [c.id, c]));
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
        <>
          <View style={{ gap: 2 }}>
            <Amount cents={s.totalCents} variant="hero" />
            <CrayonUnderline width={150} color={accents.orange} />
            <MoreLessNote month={month} totalCents={s.totalCents} prevTotalCents={s.prevTotalCents} />
          </View>

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
    </Screen>
  );
}
