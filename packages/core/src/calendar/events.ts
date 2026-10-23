import type { Cents } from '../money';
import { addDays, daysBetween, shiftMonths } from '../dates';

export type Repeat = 'none' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';

export type CalendarEvent = {
  id: number;
  name: string;
  emoji: string;
  amountCents: Cents | null;
  accountId: number | null;
  startDate: string;
  repeat: Repeat;
  leadDays: number;
  onDayAlert: boolean;
};

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: 'once',
  weekly: 'weekly',
  fortnightly: 'fortnightly',
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
};

const MONTH_STEP: Partial<Record<Repeat, number>> = { monthly: 1, quarterly: 3, yearly: 12 };
const DAY_STEP: Partial<Record<Repeat, number>> = { weekly: 7, fortnightly: 14 };

/** Occurrence k, always computed from startDate so month-end days never drift. */
function nth(e: CalendarEvent, k: number): string {
  const days = DAY_STEP[e.repeat];
  if (days) return addDays(e.startDate, days * k);
  return shiftMonths(e.startDate, (MONTH_STEP[e.repeat] ?? 0) * k);
}

/** Occurrence dates within [from, to], inclusive, ascending. */
export function occurrences(e: CalendarEvent, from: string, to: string): string[] {
  if (e.repeat === 'none') {
    return e.startDate >= from && e.startDate <= to ? [e.startDate] : [];
  }
  const out: string[] = [];
  let k = 0;
  const days = DAY_STEP[e.repeat];
  if (days && from > e.startDate) k = Math.floor(daysBetween(e.startDate, from) / days);
  for (; ; k++) {
    const d = nth(e, k);
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

export function isOccurrence(e: CalendarEvent, date: string): boolean {
  return occurrences(e, date, date).length > 0;
}

/** Only events with an amount or a paid-from account can be paid. */
export function isPayable(e: Pick<CalendarEvent, 'amountCents' | 'accountId'>): boolean {
  return e.amountCents !== null || e.accountId !== null;
}
