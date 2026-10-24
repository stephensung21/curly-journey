import { addMonthsLabel, ageMonths, formatAudShort, monthsUntilAge, projectEtf, targetMonth, todaysDollars, type EtfPoint } from '@curly/core';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useProjections } from '../../src/api/hooks';
import type { ProjectionPrefill, ProjectionProfile } from '../../src/api/types';
import { Amount } from '../../src/components/Amount';
import { AppText } from '../../src/components/AppText';
import { Card } from '../../src/components/Card';
import { Disclaimer } from '../../src/components/Disclaimer';
import { CrayonUnderline } from '../../src/components/doodles/CrayonUnderline';
import { HandNote } from '../../src/components/doodles/HandNote';
import { ProjectionChart } from '../../src/components/ProjectionChart';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { Slider } from '../../src/components/Slider';
import { Toggle } from '../../src/components/Toggle';
import { MortgageMode } from '../../src/projections/MortgageMode';
import { useProjectionState, type ProjectionState } from '../../src/projections/useProjectionState';
import { useSettings } from '../../src/settings/store';
import { accents } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/useTheme';

const MODES = [
  { value: 'etf', label: 'ETFs' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'both', label: 'Both' },
] as const;
type Mode = (typeof MODES)[number]['value'];

const MAX_MONTHS = 600;
const YEARS_AFTER_TARGET = 10;
const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;
const money = (c: number) => <Amount cents={c} decimals="never" />;

function EtfMode({ profile, prefill, p }: { profile: ProjectionProfile; prefill: ProjectionPrefill; p: ProjectionState }) {
  const t = useTheme();
  const router = useRouter();
  const hidden = useSettings(s => s.hideBalances);
  const { birthDate } = profile;
  const [headlineWidth, setHeadlineWidth] = useState(0);

  // Slider ranges come from the pre-fill, so they do not jump while dragging.
  const startMax = useMemo(() => Math.max(10_000_000, roundUp(prefill.etfStartCents * 2, 10_000_000)), [prefill.etfStartCents]);
  const monthlyMax = useMemo(() => Math.max(500_000, roundUp(prefill.etfMonthlyCents * 2, 50_000)), [prefill.etfMonthlyCents]);

  // The projection stops at 600 months, so the age slider stays within 50 years and above today's age.
  const currentAge = birthDate ? Math.floor(ageMonths(birthDate, prefill.today) / 12) : 0;
  const maxAge = birthDate ? Math.min(90, currentAge + 50) : 0;
  const minAge = birthDate ? Math.min(currentAge + 1, maxAge) : 0;
  const targetAge = Math.min(maxAge, Math.max(minAge, p.targetAge));
  const monthsToAge = birthDate ? monthsUntilAge(birthDate, prefill.today, targetAge) : p.yearsFromNow * 12;
  const headlineMonth = Math.min(MAX_MONTHS, monthsToAge);

  const { points, hitMonth } = useMemo(() => {
    const full: EtfPoint[] = projectEtf({ startCents: p.startCents, monthlyCents: p.monthlyCents, returnBps: p.returnBps, months: MAX_MONTHS }).map(pt =>
      p.todaysDollars
        ? {
            month: pt.month,
            contributionsCents: todaysDollars(pt.contributionsCents, pt.month, profile.inflationBps),
            valueCents: todaysDollars(pt.valueCents, pt.month, profile.inflationBps),
          }
        : pt,
    );
    const hit = targetMonth(full, p.targetCents);
    const horizon = Math.min(MAX_MONTHS, Math.max(monthsToAge + YEARS_AFTER_TARGET * 12, hit ?? 0));
    return { points: full.slice(0, horizon + 1), hitMonth: hit };
  }, [p.startCents, p.monthlyCents, p.returnBps, p.todaysDollars, p.targetCents, profile.inflationBps, monthsToAge]);

  const headlineValue = (points[headlineMonth] ?? points[points.length - 1]!).valueCents;
  const targetShort = formatAudShort(p.targetCents, { hidden });
  const ageAt = (m: number) => Math.floor((ageMonths(birthDate!, prefill.today) + m) / 12);

  let note: ReactNode;
  let noteLabel: string;
  if (hitMonth === 0) note = noteLabel = 'Already there';
  else if (hitMonth === null) {
    note = (
      <>
        Doesn't reach <Amount cents={p.targetCents} short inline /> within {MAX_MONTHS / 12} years
      </>
    );
    noteLabel = `Doesn't reach ${targetShort} within ${MAX_MONTHS / 12} years`;
  } else {
    const year = addMonthsLabel(prefill.today, hitMonth);
    note = noteLabel = birthDate ? `Hits ${targetShort} in ${year} (age ${ageAt(hitMonth)})` : `Hits ${targetShort} in ${year}`;
  }

  const years = p.yearsFromNow;

  return (
    <>
      <View style={{ gap: 2 }}>
        <AppText tone="muted">{birthDate ? `At ${targetAge} you'd have` : `In ${years} years you'd have`}</AppText>
        <View onLayout={e => setHeadlineWidth(e.nativeEvent.layout.width)} style={{ alignSelf: 'flex-start' }}>
          <Amount cents={headlineValue} decimals="never" variant="hero" />
        </View>
        <CrayonUnderline width={Math.max(120, Math.min(headlineWidth, 240))} color={accents.lime} />
        <HandNote>{note}</HandNote>
        {birthDate ? null : (
          <Pressable accessibilityRole="link" onPress={() => router.push('/about-you' as never)}>
            <AppText tone="muted" style={{ textDecorationLine: 'underline' }}>
              Add your birth date
            </AppText>
          </Pressable>
        )}
      </View>

      <Card>
        <ProjectionChart
          hidden={hidden}
          today={prefill.today}
          accessibilityLabel={`Projection: ${noteLabel}`}
          series={[
            { key: 'contrib', kind: 'area', color: t.line, opacity: 1, points: points.map(pt => ({ month: pt.month, cents: pt.contributionsCents })) },
            {
              key: 'growth',
              kind: 'area',
              color: accents.lime,
              stackOn: 'contrib',
              points: points.map(pt => ({ month: pt.month, cents: Math.max(pt.valueCents, pt.contributionsCents) })),
            },
          ]}
          targetCents={p.targetCents}
          targetLabel={hitMonth !== null && hitMonth > 0 ? `${targetShort} by ${addMonthsLabel(prefill.today, hitMonth)}!` : `${targetShort} target`}
          markerMonth={headlineMonth <= points.length - 1 ? headlineMonth : undefined}
          markerLabel={birthDate ? `age ${targetAge}` : `${years}y`}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <AppText variant="axis" style={{ color: accents.lime }}>
            ■ growth
          </AppText>
          <AppText variant="axis" tone="muted">
            ■ what you put in
          </AppText>
        </View>
      </Card>

      <Card style={{ gap: 6 }}>
        <Slider label="Starting value" accessibilityLabel="Starting value" value={p.startCents} min={0} max={Math.max(startMax, p.startCents)} step={100_000} onChange={p.setStart} format={money} />
        <Slider label="Monthly contribution" accessibilityLabel="Monthly contribution" value={p.monthlyCents} min={0} max={Math.max(monthlyMax, p.monthlyCents)} step={5_000} onChange={p.setMonthly} format={money} />
        <Slider label="Expected return" accessibilityLabel="Expected return" value={p.returnBps} min={0} max={1200} step={25} onChange={p.setReturnBps} format={v => <AppText variant="bodyStrong">{`${v / 100}%`}</AppText>} />
        <Slider label="Target" accessibilityLabel="Target" value={p.targetCents} min={10_000_000} max={500_000_000} step={5_000_000} onChange={p.setTargetCents} format={money} />
        {birthDate ? (
          <Slider label="Target age" accessibilityLabel="Target age" value={targetAge} min={minAge} max={maxAge} step={1} onChange={p.setTargetAge} format={v => <AppText variant="bodyStrong">{String(v)}</AppText>} />
        ) : (
          <Slider label="Years from now" accessibilityLabel="Years from now" value={p.yearsFromNow} min={1} max={50} step={1} onChange={p.setYearsFromNow} format={v => <AppText variant="bodyStrong">{String(v)}</AppText>} />
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText>Show in today's dollars</AppText>
          <Toggle value={p.todaysDollars} onChange={p.setTodaysDollars} accessibilityLabel="Show in today's dollars" />
        </View>
      </Card>
    </>
  );
}

function Loaded({ profile, prefill }: { profile: ProjectionProfile; prefill: ProjectionPrefill }) {
  const [mode, setMode] = useState<Mode>('etf');
  // Held here so switching modes keeps the session overrides.
  const p = useProjectionState(profile, prefill);
  return (
    <>
      <Segmented options={[...MODES]} value={mode} onChange={setMode} />
      {mode === 'etf' ? (
        <EtfMode profile={profile} prefill={prefill} p={p} />
      ) : mode === 'mortgage' ? (
        <MortgageMode profile={profile} prefill={prefill} p={p} />
      ) : (
        <HandNote>Coming soon</HandNote>
      )}
    </>
  );
}

export default function ProjectionsScreen() {
  const q = useProjections();
  const data = q.data;

  return (
    <Screen>
      <AppText variant="title">Projections</AppText>
      {q.isError ? <AppText tone="muted">Couldn't load projections. Try again later.</AppText> : null}
      {data ? <Loaded profile={data.profile} prefill={data.prefill} /> : null}
      <Disclaimer />
    </Screen>
  );
}
