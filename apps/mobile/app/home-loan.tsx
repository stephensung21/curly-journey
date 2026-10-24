import { formatAud, parseDecimalToCents, requiredRepayment } from '@curly/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useProjections, useUpdateProfile } from '../src/api/hooks';
import type { ProjectionPrefill, ProjectionProfile, RepaymentFrequency } from '../src/api/types';
import { Amount } from '../src/components/Amount';
import { AppText } from '../src/components/AppText';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Screen } from '../src/components/Screen';
import { Segmented } from '../src/components/Segmented';
import { useInputStyle } from '../src/components/ValueSheet';
import { accents } from '../src/theme/tokens';
import { useTheme } from '../src/theme/useTheme';

const SAVE_FAILED = "Couldn't save. Try again.";
const MAX_OFFSET_CENTS = 10_000_000; // $100,000 a month
const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

const cents = (s: string): number | null => {
  try {
    return parseDecimalToCents(s);
  } catch {
    return null;
  }
};
const dollars = (c: number) => (c / 100).toFixed(2);
const wholeNumber = (s: string): number | null => (/^\d{1,3}$/.test(s.trim()) ? Number(s) : null);

/** The monthly minimum, turned into the repayment frequency the user picked (rounded up so it still covers it). */
function perFrequency(monthlyCents: number, f: RepaymentFrequency): number {
  if (f === 'weekly') return Math.ceil((monthlyCents * 12) / 52);
  if (f === 'fortnightly') return Math.ceil((monthlyCents * 12) / 26);
  return monthlyCents;
}

function Field({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      {children}
      {error ? <AppText style={{ color: accents.pink }}>{error}</AppText> : null}
    </View>
  );
}

function Form({ profile, prefill }: { profile: ProjectionProfile; prefill: ProjectionPrefill }) {
  const t = useTheme();
  const router = useRouter();
  const input = useInputStyle();
  const update = useUpdateProfile();

  const term = profile.termMonths;
  const [rate, setRate] = useState(profile.mortgageRateBps === null ? '' : (profile.mortgageRateBps / 100).toFixed(2));
  const [repayment, setRepayment] = useState(profile.repaymentCents === null ? '' : dollars(profile.repaymentCents));
  const [freq, setFreq] = useState<RepaymentFrequency>(profile.repaymentFrequency);
  const [years, setYears] = useState(term === null ? '' : String(Math.floor(term / 12)));
  const [months, setMonths] = useState(term === null ? '' : String(term % 12));
  const [offset, setOffset] = useState(dollars(profile.offsetGrowthCents));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const rateBps = rate.trim() === '' ? null : cents(rate);
  const termMonths = years.trim() === '' && months.trim() === '' ? null : (wholeNumber(years || '0') ?? NaN) * 12 + (wholeNumber(months || '0') ?? NaN);
  const termOk = termMonths !== null && Number.isInteger(termMonths) && termMonths >= 1 && termMonths <= 600;
  const minMonthly =
    rateBps !== null && termOk && prefill.mortgageBalanceCents > 0 ? requiredRepayment(prefill.mortgageBalanceCents, rateBps, termMonths) : 0;
  const minimum = perFrequency(minMonthly, freq);

  async function save() {
    setSaveError(null);
    const e: Record<string, string> = {};
    if (rate.trim() !== '' && (rateBps === null || rateBps < 0 || rateBps > 2000)) e.rate = 'Enter a rate between 0 and 20';
    let repaymentCents: number | null = null;
    if (repayment.trim() !== '') {
      repaymentCents = cents(repayment);
      if (repaymentCents === null || repaymentCents < 1) e.repayment = 'Enter a repayment amount';
    }
    if (termMonths !== null && !termOk) e.term = 'Enter a term between 1 month and 50 years';
    const offsetCents = offset.trim() === '' ? 0 : cents(offset);
    if (offsetCents === null) e.offset = 'Enter an amount';
    else if (Math.abs(offsetCents) > MAX_OFFSET_CENTS) e.offset = `Keep this within ${formatAud(MAX_OFFSET_CENTS, { hidden: false, decimals: 'never' })} a month`;
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    try {
      await update.mutateAsync({
        mortgageRateBps: rateBps,
        repaymentCents,
        repaymentFrequency: freq,
        termMonths: termMonths,
        offsetGrowthCents: offsetCents as number,
      });
    } catch {
      setSaveError(SAVE_FAILED);
      return;
    }
    router.back();
  }

  const clear = (k: string) => setErrors(e => ({ ...e, [k]: '' }));
  const placeholderColor = t.inkFaded;

  return (
    <>
      <Card style={{ gap: 14 }}>
        <Field label="Interest rate %" error={errors.rate}>
          <TextInput
            accessibilityLabel="Interest rate %"
            placeholder="6.24"
            placeholderTextColor={placeholderColor}
            keyboardType="decimal-pad"
            value={rate}
            onChangeText={v => {
              setRate(v);
              clear('rate');
            }}
            style={input}
          />
        </Field>
        <Field label="Repayment" error={errors.repayment}>
          <TextInput
            accessibilityLabel="Repayment"
            placeholder="0.00"
            placeholderTextColor={placeholderColor}
            keyboardType="decimal-pad"
            value={repayment}
            onChangeText={v => {
              setRepayment(v);
              clear('repayment');
            }}
            style={input}
          />
          <Segmented options={[...FREQUENCIES]} value={freq} onChange={setFreq} />
          {repayment.trim() === '' && minimum > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setRepayment(dollars(minimum));
                clear('repayment');
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}
            >
              <AppText variant="bodyStrong">Use the minimum: </AppText>
              <Amount cents={minimum} />
            </Pressable>
          ) : null}
        </Field>
        <Field label="Term left" error={errors.term}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              accessibilityLabel="Years left"
              placeholder="Years"
              placeholderTextColor={placeholderColor}
              keyboardType="number-pad"
              value={years}
              onChangeText={v => {
                setYears(v);
                clear('term');
              }}
              style={[input, { flex: 1 }]}
            />
            <TextInput
              accessibilityLabel="Months left"
              placeholder="Months"
              placeholderTextColor={placeholderColor}
              keyboardType="number-pad"
              value={months}
              onChangeText={v => {
                setMonths(v);
                clear('term');
              }}
              style={[input, { flex: 1 }]}
            />
          </View>
        </Field>
        <Field label="Offset grows by" error={errors.offset}>
          <TextInput
            accessibilityLabel="Offset grows by"
            placeholder="0.00"
            placeholderTextColor={placeholderColor}
            keyboardType="numbers-and-punctuation"
            value={offset}
            onChangeText={v => {
              setOffset(v);
              clear('offset');
            }}
            style={input}
          />
          <AppText variant="label" tone="muted">
            dollars a month, across your offset accounts. Use a minus if it shrinks.
          </AppText>
        </Field>
      </Card>
      {saveError ? <AppText style={{ color: accents.pink }}>{saveError}</AppText> : null}
      <Button label="Save" disabled={update.isPending} onPress={() => void save()} />
    </>
  );
}

export default function HomeLoanScreen() {
  const router = useRouter();
  const { data, isError } = useProjections();
  return (
    <Screen>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
        <AppText tone="muted">‹ More</AppText>
      </Pressable>
      <AppText variant="title">Home loan</AppText>
      <AppText tone="muted">Used by the Mortgage and Both projections.</AppText>
      {isError ? <AppText style={{ color: accents.pink }}>Couldn't load your details. Go back and try again.</AppText> : null}
      {data ? <Form profile={data.profile} prefill={data.prefill} /> : null}
    </Screen>
  );
}
