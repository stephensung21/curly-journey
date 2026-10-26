/** The FI (financial independence) number is this many years of spending: the 4% rule. */
export const FI_MULTIPLE = 25;

export type GoalTarget = { targetCents: number; targetDate: string | null };

export type GoalProgress = {
  /** 0 to 100. */
  percent: number;
  remainingCents: number;
  /** Whole months until the target date; null without one. */
  monthsLeft: number | null;
  /** To save each month to reach it by the date (all of it now if the date has passed); null without a date. */
  monthlyNeededCents: number | null;
  reached: boolean;
};

export type FiProgress = { yearlySpendingCents: number; fiNumberCents: number; investedCents: number; percent: number };

/** Whole months from `from` to `to` (ISO dates), never below 0. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(0, months);
}

const percentOf = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.max(0, Math.round((part * 100) / whole))) : 0);

export function goalProgress(goal: GoalTarget, currentCents: number, today: string): GoalProgress {
  const remainingCents = Math.max(0, goal.targetCents - currentCents);
  const reached = remainingCents === 0;
  const monthsLeft = goal.targetDate === null ? null : monthsBetween(today, goal.targetDate);
  const monthlyNeededCents =
    monthsLeft === null ? null : reached ? 0 : monthsLeft === 0 ? remainingCents : Math.ceil(remainingCents / monthsLeft);
  return { percent: percentOf(currentCents, goal.targetCents), remainingCents, monthsLeft, monthlyNeededCents, reached };
}

export function fiProgress(yearlySpendingCents: number, investedCents: number): FiProgress {
  const fiNumberCents = yearlySpendingCents * FI_MULTIPLE;
  return { yearlySpendingCents, fiNumberCents, investedCents, percent: percentOf(investedCents, fiNumberCents) };
}
