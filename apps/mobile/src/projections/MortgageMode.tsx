import { compareOffset } from '@curly/core';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { ProjectionPrefill, ProjectionProfile } from '../api/types';
import { Amount } from '../components/Amount';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { CrayonUnderline } from '../components/doodles/CrayonUnderline';
import { HandNote } from '../components/doodles/HandNote';
import { ProjectionChart } from '../components/ProjectionChart';
import { Slider } from '../components/Slider';
import { useSettings } from '../settings/store';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { loanInput, monthYear, SetupCard, span } from './shared';
import type { ProjectionState } from './useProjectionState';

const goHomeLoan = (router: ReturnType<typeof useRouter>) => router.push('/home-loan' as never);

export function MortgageMode({ profile, prefill, p }: { profile: ProjectionProfile; prefill: ProjectionPrefill; p: ProjectionState }) {
  const t = useTheme();
  const router = useRouter();
  const hidden = useSettings(s => s.hideBalances);
  const [headlineWidth, setHeadlineWidth] = useState(0);
  const { today, mortgageBalanceCents: balance, offsetCents: offset } = prefill;
  const { offsetGrowthCents } = profile;
  const loan = loanInput(profile, prefill, p);
  const loanKey = loan ? JSON.stringify(loan.mortgage) : '';
  const cmp = useMemo(() => (loan ? compareOffset(loan.mortgage) : null), [loanKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cmp || !loan) return <SetupCard />;
  const { usingMinimum, monthlyPay, term, rate } = loan;

  const payoff = cmp.withOffset.payoffMonth;
  const sooner = payoff === null ? 0 : term - payoff;
  const note = payoff === null ? 'Not paid off at this repayment' : sooner > 0 ? `${span(sooner)} sooner than your term` : 'On track for your term';
  const withoutPayoff = cmp.withoutOffset.payoffMonth;
  const offsetsSave = payoff === null ? 0 : withoutPayoff === null ? 0 : withoutPayoff - payoff;
  const savedNote = payoff !== null && withoutPayoff === null ? 'Offsets help you pay it off within 50 years' : offsetsSave > 0 ? `Offsets save you ${span(offsetsSave)}` : null;
  const money = (c: number) => <Amount cents={c} decimals="never" />;

  const series = [
    { key: 'offset', kind: 'area' as const, color: accents.blue, points: cmp.withOffset.points.map(pt => ({ month: pt.month, cents: pt.offsetCents })) },
    { key: 'without', kind: 'dashed' as const, color: t.inkMuted, points: cmp.withoutOffset.points.map(pt => ({ month: pt.month, cents: pt.balanceCents })) },
    { key: 'with', kind: 'line' as const, color: accents.blue, points: cmp.withOffset.points.map(pt => ({ month: pt.month, cents: pt.balanceCents })) },
  ];

  const row = (label: string, detail: ReactNode) => (
    <Pressable accessibilityRole="link" onPress={() => goHomeLoan(router)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
      <AppText tone="muted">{label}</AppText>
      <AppText tone="muted">{detail} ›</AppText>
    </Pressable>
  );
  const rateText = `${rate / 100}%`;

  return (
    <>
      <View style={{ gap: 2 }}>
        <AppText tone="muted">Mortgage-free</AppText>
        {payoff === null ? null : (
          <>
            <View onLayout={e => setHeadlineWidth(e.nativeEvent.layout.width)} style={{ alignSelf: 'flex-start' }}>
              <AppText variant="hero">{monthYear(today, payoff)}</AppText>
            </View>
            <CrayonUnderline width={Math.max(120, Math.min(headlineWidth, 240))} color={accents.blue} />
          </>
        )}
        <HandNote>{note}</HandNote>
        {savedNote ? <HandNote>{savedNote}</HandNote> : null}
        {usingMinimum ? <AppText tone="muted">Using the minimum repayment</AppText> : null}
      </View>

      <Card>
        <ProjectionChart hidden={hidden} today={today} series={series} accessibilityLabel={`Mortgage projection: ${note}`} />
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <AppText variant="axis" style={{ color: accents.blue }}>
            ━ with offsets
          </AppText>
          <AppText variant="axis" tone="muted">
            ┅ without
          </AppText>
          <AppText variant="axis" style={{ color: accents.blue }}>
            ■ offset balance
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <AppText variant="axis" tone="muted">
              Interest saved
            </AppText>
            <Amount cents={cmp.interestSavedCents} decimals="never" style={{ color: accents.lime }} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="axis" tone="muted">
              Interest left
            </AppText>
            <Amount cents={cmp.withOffset.interestCents} decimals="never" />
          </View>
        </View>
        {payoff === null ? (
          <AppText variant="axis" tone="muted" style={{ marginTop: 4 }}>
            At least these amounts over 50 years
          </AppText>
        ) : withoutPayoff === null ? (
          <AppText variant="axis" tone="muted" style={{ marginTop: 4 }}>
            Interest saved is at least this (50-year limit)
          </AppText>
        ) : null}
      </Card>

      <Card style={{ gap: 6 }}>
        <Slider label="Extra repayment" accessibilityLabel="Extra repayment" value={p.extraMonthlyCents} min={0} max={500_000} step={5_000} onChange={p.setExtraMonthlyCents} format={c => <>{money(c)}</>} />
        <Slider
          label="Rate change"
          accessibilityLabel="Rate change"
          value={p.rateChangeBps / 100}
          min={-2}
          max={3}
          step={0.25}
          onChange={v => p.setRateChangeBps(Math.round(v * 100))}
          format={v => <AppText variant="bodyStrong">{`${v > 0 ? '+' : ''}${v}%`}</AppText>}
        />
        {row(
          'Loan',
          <>
            <Amount cents={balance} decimals="never" inline /> · {rateText} · <Amount cents={monthlyPay} decimals="never" inline />/mo · {span(term)}
          </>,
        )}
        {row(
          'Offsets',
          <>
            <Amount cents={offset} decimals="never" inline /> · +<Amount cents={offsetGrowthCents} decimals="never" inline />/mo
          </>,
        )}
      </Card>
    </>
  );
}
