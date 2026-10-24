import { describe, it, expect } from 'vitest';
import { monthlyRepayment, requiredRepayment, amortise, compareOffset, type MortgageInput } from '../src/index';

const base: MortgageInput = {
  balanceCents: 60_000_000, rateBps: 600, monthlyRepaymentCents: 359_730,
  offsetCents: 0, offsetGrowthCents: 0, extraMonthlyCents: 0, rateChangeBps: 0,
};

describe('repayments', () => {
  it('requiredRepayment annuity', () => {
    expect(Math.abs(requiredRepayment(60_000_000, 600, 360) - 359_730)).toBeLessThanOrEqual(1);
  });
  it('zero rate', () => expect(requiredRepayment(1000, 0, 3)).toBe(334));
  it('weekly 1000 -> 4333', () => expect(monthlyRepayment(1000, 'weekly')).toBe(4333));
  it('fortnightly and monthly', () => {
    expect(monthlyRepayment(1000, 'fortnightly')).toBe(2167);
    expect(monthlyRepayment(1000, 'monthly')).toBe(1000);
  });
});

describe('amortise', () => {
  it('pays off at month 360', () => {
    const r = amortise(base);
    expect(Math.abs((r.payoffMonth ?? 0) - 360)).toBeLessThanOrEqual(1);
    expect(r.points[0]).toEqual({ month: 0, balanceCents: 60_000_000, offsetCents: 0 });
  });
  it('offset pays off sooner and saves interest', () => {
    const c = compareOffset({ ...base, offsetCents: 10_000_000 });
    expect(c.withOffset.payoffMonth!).toBeLessThan(c.withoutOffset.payoffMonth!);
    expect(c.interestSavedCents).toBeGreaterThan(0);
  });
  it('offset > loan: zero interest', () => {
    const i = { ...base, balanceCents: 1_000_000, offsetCents: 2_000_000, monthlyRepaymentCents: 100_000 };
    const r = amortise(i);
    expect(r.interestCents).toBe(0);
    expect(r.payoffMonth).toBe(10);
    expect(compareOffset(i).interestSavedCents).toBeGreaterThanOrEqual(0);
  });
  it('repayment below interest never pays off', () => {
    const r = amortise({ ...base, monthlyRepaymentCents: 100 });
    expect(r.payoffMonth).toBeNull();
    expect(r.points).toHaveLength(601);
    for (const p of r.points) {
      expect(Number.isFinite(p.balanceCents)).toBe(true);
      expect(p.balanceCents).toBeGreaterThanOrEqual(0);
    }
  });
  it('rate change +100 bps pays off later; negative rate floors at 0', () => {
    const b = { ...base, monthlyRepaymentCents: 420_000 };
    expect(amortise({ ...b, rateChangeBps: 100 }).payoffMonth!).toBeGreaterThan(amortise(b).payoffMonth!);
    const z = amortise({ ...base, rateBps: 100, rateChangeBps: -500, monthlyRepaymentCents: 100_000 });
    expect(z.interestCents).toBe(0);
    expect(z.payoffMonth).toBe(600);
  });
});
