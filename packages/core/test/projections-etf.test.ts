import { describe, it, expect } from 'vitest';
import { projectEtf, targetMonth, todaysDollars, ageMonths, monthsUntilAge, addMonthsLabel, yearOf } from '../src/index';

describe('projectEtf', () => {
  it('compounds monthly at returnBps', () => {
    const p = projectEtf({ startCents: 1_000_000, monthlyCents: 0, returnBps: 700, months: 12 });
    expect(p).toHaveLength(13);
    expect(Math.abs(p[12]!.valueCents - Math.round(1_000_000 * (1 + 0.07 / 12) ** 12))).toBeLessThanOrEqual(1);
  });
  it('adds contributions at 0 bps', () => {
    const p = projectEtf({ startCents: 0, monthlyCents: 50_000, returnBps: 0, months: 24 });
    expect(p[24]).toEqual({ month: 24, contributionsCents: 1_200_000, valueCents: 1_200_000 });
  });
  it('months 0 gives a single point', () => {
    expect(projectEtf({ startCents: 500, monthlyCents: 100, returnBps: 700, months: 0 })).toEqual([
      { month: 0, contributionsCents: 500, valueCents: 500 },
    ]);
  });
});

describe('targetMonth', () => {
  const pts = projectEtf({ startCents: 0, monthlyCents: 100, returnBps: 0, months: 10 });
  it('0 when already met', () => expect(targetMonth(pts, 0)).toBe(0));
  it('exact month', () => expect(targetMonth(pts, 350)).toBe(4));
  it('null when never', () => expect(targetMonth(pts, 5000)).toBeNull());
});

describe('todaysDollars', () => {
  it('deflates by inflation', () => {
    expect(todaysDollars(100_000_000, 120, 250)).toBe(Math.round(100_000_000 / 1.025 ** 10));
  });
  it('is identity at month 0', () => expect(todaysDollars(12345, 0, 250)).toBe(12345));
});

describe('age', () => {
  it('ageMonths', () => {
    expect(ageMonths('1990-05-10', '2026-10-25')).toBe(437);
  });
  it('birthday boundary', () => {
    expect(ageMonths('1990-05-10', '2026-05-09')).toBe(431);
    expect(ageMonths('1990-05-10', '2026-05-10')).toBe(432);
  });
  it('monthsUntilAge floors at 0', () => {
    expect(monthsUntilAge('1990-05-10', '2026-10-25', 40)).toBe(480 - 437);
    expect(monthsUntilAge('1990-05-10', '2026-10-25', 30)).toBe(0);
  });
});

describe('labels', () => {
  it('year labels', () => {
    expect(addMonthsLabel('2026-10-25', 3)).toBe('2027');
    expect(yearOf('2026-10-25', 2)).toBe(2026);
    expect(yearOf('2026-10-25', 120)).toBe(2036);
  });
});
