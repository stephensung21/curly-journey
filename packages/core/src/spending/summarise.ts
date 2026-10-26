import type { Cents } from '../money';
import type { Flow } from './categorise';
import { institutionGroup } from './pocketsmithCategory';

export type Period = { from: string; to: string };

export type SpendLine = {
  txnId: number;
  accountId: number;
  institution: string;
  date: string;
  amountCents: Cents;
  categoryId: number | null;
  categoryKind: 'spending' | 'income' | null;
  flow: Flow;
  /** A transfer out that pays off a credit card (Amex). */
  cardPayment?: boolean;
};

export type Summary = {
  /** Spending: money out minus money back. */
  totalCents: Cents;
  /** Spending debits, as a positive number. */
  outCents: Cents;
  /** Refunds and paybacks in spending categories. */
  backCents: Cents;
  /** Credit card payments from other accounts, as a positive number. */
  cardPaymentCents: Cents;
  moneyInCents: Cents;
  mortgageCents: Cents;
  byCategory: { categoryId: number | null; cents: Cents; count: number }[];
  byInstitution: { institution: string; cents: Cents }[];
  notCounted: { flow: 'transfer' | 'mortgage' | 'not_spending'; cents: Cents; count: number }[];
  uncategorisedCount: number;
};

const pad = (n: number) => String(n).padStart(2, '0');

function daysInMonth(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
}

function prevMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

export function monthPeriod(month: string): Period {
  return { from: `${month}-01`, to: `${month}-${pad(daysInMonth(month))}` };
}

/** Amex statement: 26th of the previous month to the 25th of `month`, inclusive. */
export function statementPeriod(month: string): Period {
  return { from: `${prevMonth(month)}-26`, to: `${month}-25` };
}

const isSpending = (l: SpendLine) =>
  l.flow === 'normal' && (l.categoryKind === null || l.categoryKind === 'spending');
const isIncome = (l: SpendLine) => l.flow === 'normal' && l.categoryKind === 'income';

type Bucket = { cents: Cents; txns: Set<number> };
const bucket = (): Bucket => ({ cents: 0, txns: new Set<number>() });

export function summarise(lines: SpendLine[]): Summary {
  let spend = 0;
  let moneyIn = 0;
  let mortgage = 0;
  let out = 0;
  let back = 0;
  let cardPayment = 0;
  const cats = new Map<number | null, Bucket>();
  const insts = new Map<string, Cents>();
  const nc = new Map<string, Bucket>();
  const uncategorised = new Set<number>();

  for (const l of lines) {
    if (isSpending(l)) {
      spend -= l.amountCents;
      if (l.amountCents < 0) out -= l.amountCents;
      else back += l.amountCents;
      const c = cats.get(l.categoryId) ?? bucket();
      c.cents -= l.amountCents;
      c.txns.add(l.txnId);
      cats.set(l.categoryId, c);
      const g = institutionGroup(l.institution);
      insts.set(g, (insts.get(g) ?? 0) - l.amountCents);
      if (l.categoryId === null && l.amountCents < 0) uncategorised.add(l.txnId);
    } else if (isIncome(l)) {
      moneyIn += l.amountCents;
    }
    if (l.flow === 'mortgage') mortgage -= l.amountCents;
    if (l.cardPayment && l.amountCents < 0) cardPayment -= l.amountCents;
    if (l.flow !== 'normal' && l.amountCents < 0) {
      const n = nc.get(l.flow) ?? bucket();
      n.cents -= l.amountCents;
      n.txns.add(l.txnId);
      nc.set(l.flow, n);
    }
  }

  const order = ['transfer', 'mortgage', 'not_spending'] as const;
  return {
    totalCents: spend,
    outCents: out,
    backCents: back,
    cardPaymentCents: cardPayment,
    moneyInCents: moneyIn,
    mortgageCents: mortgage,
    byCategory: [...cats]
      .map(([categoryId, v]) => ({ categoryId, cents: v.cents, count: v.txns.size }))
      .sort((a, b) => b.cents - a.cents),
    byInstitution: [...insts]
      .filter(([, cents]) => cents > 0)
      .map(([institution, cents]) => ({ institution, cents }))
      .sort((a, b) => b.cents - a.cents),
    notCounted: order.flatMap((flow) => {
      const v = nc.get(flow);
      return v ? [{ flow, cents: v.cents, count: v.txns.size }] : [];
    }),
    uncategorisedCount: uncategorised.size,
  };
}

type InOut = { inCents: Cents; mortgageCents: Cents; spendingCents: Cents };
const zero = (): InOut => ({ inCents: 0, mortgageCents: 0, spendingCents: 0 });

function add(acc: InOut, l: SpendLine): void {
  if (isSpending(l)) acc.spendingCents -= l.amountCents;
  else if (isIncome(l)) acc.inCents += l.amountCents;
  if (l.flow === 'mortgage') acc.mortgageCents -= l.amountCents;
}

export function inOutByMonth(lines: SpendLine[], months: string[]): ({ month: string } & InOut)[] {
  const by = new Map(months.map((m) => [m, zero()]));
  for (const l of lines) {
    const acc = by.get(l.date.slice(0, 7));
    if (acc) add(acc, l);
  }
  return months.map((month) => ({ month, ...(by.get(month) ?? zero()) }));
}

export function runningByDay(
  lines: SpendLine[],
  month: string,
  today: string,
): ({ day: number } & InOut)[] {
  const todayMonth = today.slice(0, 7);
  if (todayMonth < month) return [];
  const last = todayMonth === month ? Number(today.slice(8, 10)) : daysInMonth(month);
  const perDay = new Map<number, InOut>();
  for (const l of lines) {
    if (l.date.slice(0, 7) !== month) continue;
    const day = Number(l.date.slice(8, 10));
    if (day > last) continue;
    const acc = perDay.get(day) ?? zero();
    add(acc, l);
    perDay.set(day, acc);
  }
  const run = zero();
  const out: ({ day: number } & InOut)[] = [];
  for (let day = 1; day <= last; day++) {
    const d = perDay.get(day);
    if (d) {
      run.inCents += d.inCents;
      run.mortgageCents += d.mortgageCents;
      run.spendingCents += d.spendingCents;
    }
    out.push({ day, ...run });
  }
  return out;
}
