import { describe, it, expect } from 'vitest';
import { amortise, crossoverMonth, offsetVsInvest, projectEtf, type MortgageInput } from '../src/index';

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

describe('offsetVsInvest net-worth gains', () => {
  const p = { mortgage, etf, spareCents: 50_000, distributionYieldBps: 300, taxRateBps: 0, atMonth: 120 };
  it('etfGainCents equals the extra ETF value', () => {
    const r = offsetVsInvest(p);
    expect(r.etfGainCents).toBe(r.extraEtfCents);
  });
  it('the two gains are close when the return equals the mortgage rate and there is no tax', () => {
    const r = offsetVsInvest({ ...p, etf: { ...etf, returnBps: 600 } });
    expect(r.offsetGainCents).toBeGreaterThan(0);
    expect(Math.abs(r.offsetGainCents - r.etfGainCents) / r.etfGainCents).toBeLessThan(0.03);
  });
  it('the offset wins at 7% return, 6% rate, 45% tax on a 3% yield', () => {
    const r = offsetVsInvest({ ...p, taxRateBps: 4500 });
    expect(r.offsetGainCents).toBeGreaterThan(r.etfGainCents);
  });
  it('after payoff the offset keeps the spare cash and the repayments no longer paid', () => {
    const small = { ...mortgage, balanceCents: 6_000_000, monthlyRepaymentCents: 100_000 };
    const r = offsetVsInvest({ ...p, mortgage: small, spareCents: 300_000, atMonth: 120 });
    const base = amortise(small).payoffMonth!;
    const boosted = amortise({ ...small, offsetGrowthCents: 300_000 }).payoffMonth!;
    expect(boosted).toBeLessThan(base);
    // Both loans are gone by month 120: the boosted arm has the spare cash plus the repayments it skipped.
    expect(r.offsetGainCents).toBe(300_000 * 120 + (base - boosted) * 100_000);
  });
});
