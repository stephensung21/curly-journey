import { shiftMonths } from '../dates';

export type EtfInput = { startCents: number; monthlyCents: number; returnBps: number; months: number };
export type EtfPoint = { month: number; contributionsCents: number; valueCents: number };

/** Month 0 is today. Each month: value + round(value × r) + monthly, r = bps / 10,000 / 12. */
export function projectEtf(i: EtfInput): EtfPoint[] {
  const months = Math.max(0, Math.min(600, Math.floor(i.months)));
  const r = i.returnBps / 10_000 / 12;
  const points: EtfPoint[] = [{ month: 0, contributionsCents: i.startCents, valueCents: i.startCents }];
  let value = i.startCents;
  for (let m = 1; m <= months; m++) {
    value = value + Math.round(value * r) + i.monthlyCents;
    points.push({ month: m, contributionsCents: i.startCents + i.monthlyCents * m, valueCents: value });
  }
  return points;
}

/** First month with valueCents >= targetCents; null if never reached. */
export function targetMonth(points: EtfPoint[], targetCents: number): number | null {
  for (const p of points) if (p.valueCents >= targetCents) return p.month;
  return null;
}

/** Deflate a future value to today's dollars. */
export function todaysDollars(cents: number, month: number, inflationBps: number): number {
  return Math.round(cents / (1 + inflationBps / 10_000) ** (month / 12));
}

/** Whole months from birthDate to today (YYYY-MM-DD); a month counts once its day-of-month is reached. */
export function ageMonths(birthDate: string, today: string): number {
  const months =
    (Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4))) * 12 +
    (Number(today.slice(5, 7)) - Number(birthDate.slice(5, 7)));
  return months - (Number(today.slice(8, 10)) < Number(birthDate.slice(8, 10)) ? 1 : 0);
}

/** Months from today until the given age, floored at 0. */
export function monthsUntilAge(birthDate: string, today: string, age: number): number {
  return Math.max(0, age * 12 - ageMonths(birthDate, today));
}

/** Calendar year (YYYY) `month` months after today. */
export function addMonthsLabel(today: string, month: number): string {
  return shiftMonths(today, month).slice(0, 4);
}

export function yearOf(today: string, month: number): number {
  return Number(addMonthsLabel(today, month));
}
