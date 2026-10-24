import { addMonthsLabel, compareOffset, crossoverMonth, offsetVsInvest, projectEtf } from '@curly/core';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import type { ProjectionPrefill, ProjectionProfile } from '../api/types';
import { Amount } from '../components/Amount';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import { CrayonUnderline } from '../components/doodles/CrayonUnderline';
import { ProjectionChart } from '../components/ProjectionChart';
import { Slider } from '../components/Slider';
import { useSettings } from '../settings/store';
import { accents } from '../theme/tokens';
import { ageTarget, loanInput, MAX_MONTHS, SetupCard, span } from './shared';
import type { ProjectionState } from './useProjectionState';

const YEARS_AFTER = 10;

export function BothMode({ profile, prefill, p }: { profile: ProjectionProfile; prefill: ProjectionPrefill; p: ProjectionState }) {
  const router = useRouter();
  const hidden = useSettings(s => s.hideBalances);
  const { birthDate, taxRateBps } = profile;
  const { inflationBps, distributionYieldBps } = p;
  const { today } = prefill;
  const { targetAge, headlineMonth } = ageTarget(profile, prefill, p);
  const years = p.yearsFromNow;

  const loan = loanInput(profile, prefill, p);
  const loanKey = loan ? JSON.stringify(loan.mortgage) : '';
  const cmp = useMemo(() => (loan ? compareOffset(loan.mortgage) : null), [loanKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const etf = useMemo(
    () => projectEtf({ startCents: p.startCents, monthlyCents: p.monthlyCents, returnBps: p.returnBps, months: MAX_MONTHS }),
    [p.startCents, p.monthlyCents, p.returnBps],
  );
  const cross = useMemo(() => (cmp ? crossoverMonth(etf, cmp.withOffset.points) : null), [etf, cmp]);
  const vs = useMemo(
    () =>
      loan
        ? offsetVsInvest({
            mortgage: loan.mortgage,
            etf: { startCents: p.startCents, monthlyCents: p.monthlyCents, returnBps: p.returnBps, months: MAX_MONTHS },
            spareCents: p.spareCents,
            distributionYieldBps,
            taxRateBps: taxRateBps ?? 0,
            atMonth: headlineMonth,
          })
        : null,
    [loanKey, p.startCents, p.monthlyCents, p.returnBps, p.spareCents, distributionYieldBps, taxRateBps, headlineMonth], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!cmp || !loan || !vs) return <SetupCard profile={profile} prefill={prefill} />;

  const loanPoints = cmp.withOffset.points;
  const horizon = Math.min(MAX_MONTHS, Math.max(headlineMonth, cross ?? 0) + YEARS_AFTER * 12);
  const etfValue = etf[headlineMonth]!.valueCents;
  const loanOwing = loanPoints[headlineMonth]?.balanceCents ?? 0;
  const net = etfValue - loanOwing;
  const at = birthDate ? `at ${targetAge}` : `in ${years} years`;

  const paidOffFirst = cross !== null && cross > 0 && cross === cmp.withOffset.payoffMonth;
  const headline =
    cross === 0
      ? 'Your ETFs already cover the loan'
      : cross === null
        ? 'Not within 50 years'
        : paidOffFirst
          ? `Mortgage paid off first, in ${addMonthsLabel(today, cross)}`
          : `ETFs overtake your mortgage in ${addMonthsLabel(today, cross)}`;

  const neither = cmp.withOffset.payoffMonth === null && vs.monthsSooner === 0;
  const payoffText = neither
    ? 'neither pays it off within 50 years'
    : vs.monthsSooner === null
      ? 'pays it off within 50 years'
      : vs.monthsSooner === 0
        ? 'no change to when you finish'
        : `mortgage-free ${span(vs.monthsSooner)} sooner`;
  // Both rows are net worth at the target: the spare cash plus what it earned or saved.
  const winner = vs.offsetGainCents > vs.etfGainCents ? 'offset' : vs.etfGainCents > vs.offsetGainCents ? 'etf' : null;
  const lime = (on: boolean) => (on ? { color: accents.lime } : undefined);

  const tile = (label: string, cents: number, color?: string) => (
    <View style={{ flex: 1 }}>
      <AppText variant="axis" tone="muted">
        {label}
      </AppText>
      <Amount cents={cents} decimals="never" style={color ? { color } : undefined} />
    </View>
  );
  const money = (c: number) => <Amount cents={c} decimals="never" />;
  const pct = (bps: number) => `${bps / 100}%`;

  return (
    <>
      <View style={{ gap: 2 }}>
        <AppText variant="title">{headline}</AppText>
        <CrayonUnderline width={120} color={accents.orange} />
      </View>

      <Card>
        <ProjectionChart
          hidden={hidden}
          today={today}
          accessibilityLabel={`Projection: ${headline}`}
          series={[
            { key: 'etf', kind: 'line', color: accents.lime, points: etf.slice(0, horizon + 1).map(pt => ({ month: pt.month, cents: pt.valueCents })) },
            { key: 'loan', kind: 'line', color: accents.blue, points: loanPoints.filter(pt => pt.month <= horizon).map(pt => ({ month: pt.month, cents: pt.balanceCents })) },
          ]}
          circleMonth={cross !== null && cross > 0 && cross <= horizon ? cross : undefined}
          circleSeriesKey="etf"
          markerMonth={headlineMonth <= horizon ? headlineMonth : undefined}
          markerLabel={birthDate ? `age ${targetAge}` : `${years}y`}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <AppText variant="axis" style={{ color: accents.lime }}>
            ━ ETFs
          </AppText>
          <AppText variant="axis" style={{ color: accents.blue }}>
            ━ mortgage owing
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {tile(`ETFs ${at}`, etfValue)}
          {tile(`Loan ${at}`, loanOwing)}
          {tile('Net', net, net >= 0 ? accents.lime : undefined)}
        </View>
      </Card>

      <Card style={{ gap: 6 }}>
        <AppText variant="bodyStrong">Spare cash each month</AppText>
        <Slider label="Amount" accessibilityLabel="Spare cash" value={p.spareCents} min={0} max={300_000} step={5_000} onChange={p.setSpareCents} format={money} />
        <View style={{ gap: 4 }}>
          <AppText style={lime(winner === 'offset')}>
            Into offsets → <Amount cents={vs.offsetGainCents} decimals="never" signed inline /> better off {at} · {payoffText}
          </AppText>
          <AppText style={lime(winner === 'etf')}>
            Into ETFs → <Amount cents={vs.etfGainCents} decimals="never" signed inline /> better off {at} (after tax on distributions)
          </AppText>
        </View>
        {taxRateBps === null ? (
          <Pressable accessibilityRole="link" onPress={() => router.push('/about-you' as never)}>
            <AppText tone="muted" style={{ textDecorationLine: 'underline' }}>
              Add your tax rate for a fairer comparison
            </AppText>
          </Pressable>
        ) : null}
        <Slider
          label="Distributions"
          accessibilityLabel="Distributions"
          value={distributionYieldBps}
          min={0}
          max={800}
          step={25}
          onChange={p.setDistributionYieldBps}
          format={v => <AppText variant="bodyStrong">{pct(v)}</AppText>}
        />
        <AppText variant="axis" tone="muted">
          {`${pct(p.returnBps)} return · ${pct(inflationBps)} inflation · ${pct(distributionYieldBps)} distributions${taxRateBps === null ? '' : ` taxed at ${pct(taxRateBps)}`}`}
        </AppText>
      </Card>
    </>
  );
}
