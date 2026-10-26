import { describe, expect, it } from 'vitest';
import { fiProgress, goalProgress, monthsBetween } from '../src/goals/goals';

describe('monthsBetween', () => {
  it('counts whole months from today to the target date, at least 0', () => {
    expect(monthsBetween('2026-10-26', '2027-10-26')).toBe(12);
    expect(monthsBetween('2026-10-26', '2027-10-25')).toBe(11);
    expect(monthsBetween('2026-10-26', '2026-11-30')).toBe(1);
    expect(monthsBetween('2026-10-26', '2026-01-01')).toBe(0);
  });
});

describe('goalProgress', () => {
  it('gives percent, what is left and the monthly amount to reach it by the date', () => {
    expect(goalProgress({ targetCents: 1_000_000, targetDate: '2027-10-26' }, 400_000, '2026-10-26')).toEqual({
      percent: 40,
      remainingCents: 600_000,
      monthsLeft: 12,
      monthlyNeededCents: 50_000,
      reached: false,
    });
  });

  it('has no monthly amount without a date, and none needed once reached', () => {
    expect(goalProgress({ targetCents: 1_000_000, targetDate: null }, 250_000, '2026-10-26')).toMatchObject({
      percent: 25,
      monthsLeft: null,
      monthlyNeededCents: null,
    });
    expect(goalProgress({ targetCents: 1_000_000, targetDate: '2027-01-01' }, 1_200_000, '2026-10-26')).toEqual({
      percent: 100,
      remainingCents: 0,
      monthsLeft: 2,
      monthlyNeededCents: 0,
      reached: true,
    });
  });

  it('a date already passed needs the whole rest now, and negative progress shows as 0%', () => {
    expect(goalProgress({ targetCents: 1_000_000, targetDate: '2026-01-01' }, -50_000, '2026-10-26')).toMatchObject({
      percent: 0,
      remainingCents: 1_050_000,
      monthsLeft: 0,
      monthlyNeededCents: 1_050_000,
    });
  });

  it('rounds the monthly amount up to the cent', () => {
    expect(goalProgress({ targetCents: 1_000, targetDate: '2027-01-26' }, 0, '2026-10-26').monthlyNeededCents).toBe(334);
  });
});

describe('fiProgress', () => {
  it('is 25 times a year of spending, against what is invested', () => {
    expect(fiProgress(4_000_000, 25_000_000)).toEqual({ yearlySpendingCents: 4_000_000, fiNumberCents: 100_000_000, investedCents: 25_000_000, percent: 25 });
  });

  it('is 0% with no spending yet', () => {
    expect(fiProgress(0, 1_000)).toMatchObject({ fiNumberCents: 0, percent: 0 });
  });
});
