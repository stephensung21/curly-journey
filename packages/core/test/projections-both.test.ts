import { describe, it, expect } from 'vitest';
import { crossoverMonth, offsetVsInvest, projectEtf, type MortgageInput } from '../src/index';

const mortgage: MortgageInput = {
  balanceCents: 60_000_000, rateBps: 600, monthlyRepaymentCents: 359_730,
  offsetCents: 0, offsetGrowthCents: 0, extraMonthlyCents: 0, rateChangeBps: 0,
};
const etf = { startCents: 0, monthlyCents: 50_000, returnBps: 700, months: 360 };

describe('crossoverMonth', () => {
  it('never -> null', () => {
    const e = projectEtf({ startCents: 0, monthlyCents: 0, returnBps: 0, months: 12 });
    expect(crossoverMonth(e, Array.from({ length: 13 }, (_, m) => ({ month: m, balanceCents: 100, offsetCents: 0 })))).toBeNull();
  });
  it('already crossed -> 0', () => {
    const e = projectEtf({ startCents: 500, monthlyCents: 0, returnBps: 0, months: 3 });
    expect(crossoverMonth(e, [{ month: 0, balanceCents: 100, offsetCents: 0 }])).toBe(0);
  });
  it('missing loan month counts as 0', () => {
    const e = projectEtf({ startCents: 0, monthlyCents: 0, returnBps: 0, months: 3 });
    expect(crossoverMonth(e, [{ month: 0, balanceCents: 100, offsetCents: 0 }])).toBe(1);
  });
});

describe('offsetVsInvest', () => {
  const p = { mortgage, etf, spareCents: 50_000, distributionYieldBps: 300, taxRateBps: 0, atMonth: 120 };
  it('positive months sooner and extra ETF', () => {
    const r = offsetVsInvest(p);
    expect(r.monthsSooner!).toBeGreaterThan(0);
    expect(r.extraEtfCents).toBeGreaterThan(0);
  });
  it('tax drag lowers extraEtfCents', () => {
    const taxed = offsetVsInvest({ ...p, taxRateBps: 4500 });
    expect(taxed.extraEtfCents).toBeLessThan(offsetVsInvest(p).extraEtfCents);
  });
  it('null when baseline never pays off but new does', () => {
    const r = offsetVsInvest({ ...p, mortgage: { ...mortgage, monthlyRepaymentCents: 290_000 }, spareCents: 200_000 });
    expect(r.monthsSooner).toBeNull();
  });
});
