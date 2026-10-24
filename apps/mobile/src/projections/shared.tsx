import { ageMonths, monthlyRepayment, monthsUntilAge, requiredRepayment, shiftMonths, type MortgageInput } from '@curly/core';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import type { ProjectionPrefill, ProjectionProfile } from '../api/types';
import { AppText } from '../components/AppText';
import { Card } from '../components/Card';
import type { ProjectionState } from './useProjectionState';

export const MAX_MONTHS = 600;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthYear = (today: string, m: number) => {
  const iso = shiftMonths(today, m);
  return `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
};
export const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
export const span = (months: number) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? plural(y, 'year') : '', m ? plural(m, 'month') : ''].filter(Boolean).join(' ');
};

/** The loan as saved, or null when the home loan is not set up. Shared by Mortgage and Both modes. */
export function loanInput(profile: ProjectionProfile, prefill: ProjectionPrefill, p: ProjectionState) {
  const { mortgageBalanceCents: balance, offsetCents: offset } = prefill;
  const { mortgageRateBps: rate, termMonths: term, repaymentCents, repaymentFrequency, offsetGrowthCents } = profile;
  const ready = balance > 0 && rate !== null && term !== null && term > 0;
  if (!ready) return null;
  const usingMinimum = repaymentCents === null;
  const monthlyPay = usingMinimum ? requiredRepayment(balance, rate, term) : monthlyRepayment(repaymentCents, repaymentFrequency);
  const mortgage: MortgageInput = {
    balanceCents: balance,
    rateBps: rate,
    monthlyRepaymentCents: monthlyPay,
    offsetCents: offset,
    offsetGrowthCents,
    extraMonthlyCents: p.extraMonthlyCents,
    rateChangeBps: p.rateChangeBps,
  };
  return { mortgage, usingMinimum, monthlyPay, term, rate };
}

/** The projection stops at 600 months, so the age stays within 50 years and above today's age. */
export function ageTarget(profile: ProjectionProfile, prefill: ProjectionPrefill, p: ProjectionState) {
  const { birthDate } = profile;
  const currentAge = birthDate ? Math.floor(ageMonths(birthDate, prefill.today) / 12) : 0;
  const maxAge = birthDate ? Math.min(90, currentAge + 50) : 0;
  const minAge = birthDate ? Math.min(currentAge + 1, maxAge) : 0;
  const targetAge = Math.min(maxAge, Math.max(minAge, p.targetAge));
  const monthsToAge = birthDate ? monthsUntilAge(birthDate, prefill.today, targetAge) : p.yearsFromNow * 12;
  return { currentAge, maxAge, minAge, targetAge, monthsToAge, headlineMonth: Math.min(MAX_MONTHS, monthsToAge) };
}

export function SetupCard() {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/home-loan' as never)}>
      <Card style={{ gap: 4 }}>
        <AppText variant="bodyStrong">Set up your home loan</AppText>
        <AppText tone="muted">Add your rate, term and repayment to see when you'll be mortgage-free.</AppText>
      </Card>
    </Pressable>
  );
}
