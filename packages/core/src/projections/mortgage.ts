export type Frequency = 'weekly' | 'fortnightly' | 'monthly';

const HORIZON = 600;

/** Monthly equivalent of a repayment: weekly x52/12, fortnightly x26/12, rounded. */
export function monthlyRepayment(cents: number, f: Frequency): number {
  if (f === 'weekly') return Math.round((cents * 52) / 12);
  if (f === 'fortnightly') return Math.round((cents * 26) / 12);
  return cents;
}

/** Standard annuity payment, rounded up to the cent. Rate 0 -> ceil(balance / term). */
export function requiredRepayment(balanceCents: number, rateBps: number, termMonths: number): number {
  if (balanceCents <= 0 || termMonths <= 0) return 0;
  const r = Math.max(0, rateBps) / 10_000 / 12;
  if (r === 0) return Math.ceil(balanceCents / termMonths);
  const pay = (balanceCents * r) / (1 - (1 + r) ** -termMonths);
  // Guard against float noise nudging an exact cent value up by one.
  return Math.ceil(pay - 1e-6);
}

export type MortgageInput = {
  balanceCents: number;
  rateBps: number;
  monthlyRepaymentCents: number;
  offsetCents: number;
  offsetGrowthCents: number;
  extraMonthlyCents: number;
  rateChangeBps: number;
};
export type MortgagePoint = { month: number; balanceCents: number; offsetCents: number };
export type AmortiseResult = { points: MortgagePoint[]; payoffMonth: number | null; interestCents: number };

export function amortise(i: MortgageInput): AmortiseResult {
  const r = Math.max(0, i.rateBps + i.rateChangeBps) / 10_000 / 12;
  let balance = Math.max(0, i.balanceCents);
  let offset = Math.max(0, i.offsetCents);
  const points: MortgagePoint[] = [{ month: 0, balanceCents: balance, offsetCents: offset }];
  let interestTotal = 0;
  let payoffMonth: number | null = balance === 0 ? 0 : null;
  for (let m = 1; m <= HORIZON && balance > 0; m++) {
    const interest = Math.round(Math.max(0, balance - offset) * r);
    interestTotal += interest;
    balance = Math.max(0, balance + interest - i.monthlyRepaymentCents - i.extraMonthlyCents);
    offset = Math.max(0, offset + i.offsetGrowthCents);
    points.push({ month: m, balanceCents: balance, offsetCents: offset });
    if (balance === 0) payoffMonth = m;
  }
  return { points, payoffMonth, interestCents: interestTotal };
}

export function compareOffset(i: MortgageInput): {
  withOffset: AmortiseResult;
  withoutOffset: AmortiseResult;
  interestSavedCents: number;
} {
  const withOffset = amortise(i);
  const withoutOffset = amortise({ ...i, offsetCents: 0, offsetGrowthCents: 0 });
  return {
    withOffset,
    withoutOffset,
    interestSavedCents: Math.max(0, withoutOffset.interestCents - withOffset.interestCents),
  };
}
