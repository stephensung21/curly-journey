import { compareOffset, monthlyRepayment, requiredRepayment, shiftMonths } from '@curly/core';
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
import type { ProjectionState } from './useProjectionState';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (today: string, m: number) => {
  const iso = shiftMonths(today, m);
  return `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
};
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
const span = (months: number) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? plural(y, 'year') : '', m ? plural(m, 'month') : ''].filter(Boolean).join(' ');
};
const goHomeLoan = (router: ReturnType<typeof useRouter>) => router.push('/home-loan' as never);

export function MortgageMode({ profile, prefill, p }: { profile: ProjectionProfile; prefill: ProjectionPrefill; p: ProjectionState }) {
  const t = useTheme();
  const router = useRouter();
  const hidden = useSettings(s => s.hideBalances);
  const [headlineWidth, setHeadlineWidth] = useState(0);
  const { mortgageBalanceCents: balance, offsetCents: offset, today } = prefill;
  const { mortgageRateBps: rate, termMonths: term, repaymentCents, repaymentFrequency, offsetGrowthCents } = profile;

  const ready = balance > 0 && rate !== null && term !== null && term > 0;
  const usingMinimum = ready && repaymentCents === null;
  const monthlyPay = !ready ? 0 : repaymentCents === null ? requiredRepayment(balance, rate, term) : monthlyRepayment(repaymentCents, repaymentFrequency);

  const cmp = useMemo(
    () =>
      ready
        ? compareOffset({
            balanceCents: balance,
            rateBps: rate,
            monthlyRepaymentCents: monthlyPay,
            offsetCents: offset,
            offsetGrowthCents,
            extraMonthlyCents: p.extraMonthlyCents,
            rateChangeBps: p.rateChangeBps,
          })
        : null,
    [ready, balance, rate, monthlyPay, offset, offsetGrowthCents, p.extraMonthlyCents, p.rateChangeBps],
  );

  if (!cmp || !ready) {
    return (
      <Pressable accessibilityRole="button" onPress={() => goHomeLoan(router)}>
        <Card style={{ gap: 4 }}>
          <AppText variant="bodyStrong">Set up your home loan</AppText>
          <AppText tone="muted">Add your rate, term and repayment to see when you'll be mortgage-free.</AppText>
        </Card>
      </Pressable>
    );
  }

  const payoff = cmp.withOffset.payoffMonth;
  const sooner = payoff === null ? 0 : term - payoff;
  const note =
    payoff === null ? 'Not paid off at this repayment' : sooner > 0 ? `${span(sooner)} sooner than your term, thanks to your offsets` : 'On track for your term';
  const truncated = cmp.withoutOffset.payoffMonth === null;
  const money = (c: number) => <Amount cents={c} decimals="never" />;

  const series = [
    { key: 'offset', kind: 'area' as const, color: accents.blue, opacity: 0.2, points: cmp.withOffset.points.map(pt => ({ month: pt.month, cents: pt.offsetCents })) },
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
        {truncated ? (
          <AppText variant="axis" tone="muted" style={{ marginTop: 4 }}>
            At least these amounts over 50 years
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
