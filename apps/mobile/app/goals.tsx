import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAccounts, useGoals } from '../src/api/hooks';
import type { Account, FiProgress, Goal } from '../src/api/types';
import { Amount } from '../src/components/Amount';
import { AppText } from '../src/components/AppText';
import { Card } from '../src/components/Card';
import { GoalSheet } from '../src/components/GoalSheet';
import { HeroCard } from '../src/components/HeroCard';
import { IconTile } from '../src/components/IconTile';
import { monthLabel } from '../src/components/MonthSwitcher';
import { Screen } from '../src/components/Screen';
import { accents } from '../src/theme/tokens';
import { useTheme } from '../src/theme/useTheme';

function Bar({ percent, color }: { percent: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surfaceSunken, overflow: 'hidden' }}>
      <View style={{ width: `${percent}%`, height: 8, backgroundColor: color }} />
    </View>
  );
}

/** 25 years of spending, and how much of it is already invested. */
function FiCard({ fi }: { fi: FiProgress }) {
  return (
    <HeroCard style={{ gap: 6 }}>
      <AppText variant="label" tone="onAccent">
        Your FI number
      </AppText>
      {fi.yearlySpendingCents > 0 ? (
        <>
          <Amount cents={fi.fiNumberCents} variant="hero" tone="onAccent" decimals="never" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
            <AppText variant="label" tone="onAccent">
              25 × a year of spending:
            </AppText>
            <Amount cents={fi.yearlySpendingCents} variant="label" tone="onAccent" decimals="never" />
          </View>
          <Bar percent={fi.percent} color={accents.lime} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
            <AppText variant="label" tone="onAccent">
              Invested
            </AppText>
            <Amount cents={fi.investedCents} variant="label" tone="onAccent" decimals="never" />
            <AppText variant="label" tone="onAccent">{`· ${fi.percent}% there`}</AppText>
          </View>
        </>
      ) : (
        <AppText tone="onAccent">Once there's spending to go on, this shows 25 × a year of it.</AppText>
      )}
    </HeroCard>
  );
}

function GoalCard({ goal, accounts, onPress }: { goal: Goal; accounts: Account[]; onPress: () => void }) {
  const tracks = goal.accountIds.length
    ? goal.accountIds.map(id => accounts.find(a => a.id === id)).flatMap(a => (a ? [a.displayName ?? a.name] : [])).join(', ')
    : 'Net worth';
  const by = goal.targetDate ? monthLabel(goal.targetDate.slice(0, 7)) : null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Goal ${goal.name}`} onPress={onPress}>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconTile emoji={goal.emoji} color={accents.lime} size={36} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{goal.name}</AppText>
            <AppText variant="label" tone="muted">
              {tracks}
            </AppText>
          </View>
          <AppText variant="bodyStrong">{`${goal.percent}%`}</AppText>
        </View>
        <Bar percent={goal.percent} color={goal.reached ? accents.lime : accents.orange} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          <Amount cents={goal.currentCents} variant="label" tone="muted" decimals="never" />
          <AppText variant="label" tone="muted">
            of
          </AppText>
          <Amount cents={goal.targetCents} variant="label" tone="muted" decimals="never" />
        </View>
        {goal.reached ? (
          <AppText variant="label">Reached 🎉</AppText>
        ) : goal.monthlyNeededCents !== null && by ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
            <Amount cents={goal.monthlyNeededCents} variant="label" decimals="never" />
            <AppText variant="label">{goal.monthsLeft === 0 ? `to reach it by ${by}` : `a month to reach it by ${by}`}</AppText>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

type SheetState = { editing: Goal | null } | null;

export default function GoalsScreen() {
  const t = useTheme();
  const router = useRouter();
  const q = useGoals();
  const accounts = (useAccounts().data?.accounts ?? []).filter(a => a.countsNetWorth && !a.hidden);
  const [sheet, setSheet] = useState<SheetState>(null);
  const dashed = { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.inkMuted, borderRadius: 14, padding: 12 } as const;

  return (
    <Screen>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
        <AppText tone="muted">‹ More</AppText>
      </Pressable>
      <AppText variant="title">Goals</AppText>
      {q.isError && !q.data ? <AppText tone="muted">Couldn't load goals. Try again soon.</AppText> : null}
      {q.isLoading ? <AppText tone="muted">Loading…</AppText> : null}
      {q.data ? (
        <>
          <FiCard fi={q.data.fi} />
          {q.data.goals.map(g => (
            <GoalCard key={g.id} goal={g} accounts={accounts} onPress={() => setSheet({ editing: g })} />
          ))}
        </>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => setSheet({ editing: null })} style={dashed}>
        <AppText tone="muted">+ New goal</AppText>
      </Pressable>
      <GoalSheet visible={sheet !== null} editing={sheet?.editing ?? null} accounts={accounts} onClose={() => setSheet(null)} />
    </Screen>
  );
}
