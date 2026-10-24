import type { Cents } from '../money';
import type { Summary } from '../spending/summarise';
import { minusMonths } from '../dates';

export type SpendingLimit = { id: number; categoryId: number | null; amountCents: Cents; warnPercent: number };
export type LimitLevel = 'ok' | 'warn' | 'over';
export type LimitStatus = SpendingLimit & { spentCents: Cents; percent: number; level: LimitLevel };

export const WHOLE_MONTH_LABEL = "This month's spending";

export function limitStatuses(limits: SpendingLimit[], s: Pick<Summary, 'totalCents' | 'byCategory'>): LimitStatus[] {
  return limits.map((l) => {
    const spentCents =
      l.categoryId === null ? s.totalCents : (s.byCategory.find((c) => c.categoryId === l.categoryId)?.cents ?? 0);
    const percent = Math.floor((Math.max(0, spentCents) * 100) / l.amountCents);
    const level: LimitLevel = percent >= 100 ? 'over' : percent >= l.warnPercent ? 'warn' : 'ok';
    return { ...l, spentCents, percent, level };
  });
}

export function limitMessage(label: string, percent: number): string {
  return `${label} is at ${percent}% of your limit`;
}

/** Manual values need an update once their as-of date is 3 calendar months old. */
export function isManualStale(balanceDate: string | null, today: string): boolean {
  if (balanceDate === null) return true;
  return balanceDate <= minusMonths(today, 3);
}
