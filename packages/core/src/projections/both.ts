import { projectEtf, type EtfInput, type EtfPoint } from './etf';
import { amortise, type MortgageInput, type MortgagePoint } from './mortgage';

/** First month where ETF value >= loan balance (a loan missing past payoff counts as 0); null if never. */
export function crossoverMonth(etf: EtfPoint[], loan: MortgagePoint[]): number | null {
  const byMonth = new Map(loan.map((p) => [p.month, p.balanceCents]));
  for (const p of etf) {
    if (p.valueCents >= (byMonth.get(p.month) ?? 0)) return p.month;
  }
  return null;
}

export function offsetVsInvest(p: {
  mortgage: MortgageInput;
  etf: EtfInput;
  spareCents: number;
  distributionYieldBps: number;
  taxRateBps: number;
  atMonth: number;
}): { monthsSooner: number | null; extraEtfCents: number; offsetGainCents: number; etfGainCents: number } {
  const base = amortise(p.mortgage);
  const boosted = amortise({ ...p.mortgage, offsetGrowthCents: p.mortgage.offsetGrowthCents + p.spareCents });
  let monthsSooner: number | null;
  if (base.payoffMonth !== null && boosted.payoffMonth !== null) monthsSooner = base.payoffMonth - boosted.payoffMonth;
  else if (base.payoffMonth === null && boosted.payoffMonth !== null) monthsSooner = null;
  else monthsSooner = 0;

  const effectiveReturnBps = p.etf.returnBps - Math.round((p.distributionYieldBps * p.taxRateBps) / 10_000);
  const at = (monthlyCents: number) => {
    const pts = projectEtf({ ...p.etf, monthlyCents, returnBps: effectiveReturnBps, months: p.atMonth });
    return pts[pts.length - 1]!.valueCents;
  };
  const extraEtfCents = at(p.etf.monthlyCents + p.spareCents) - at(p.etf.monthlyCents);

  // Net worth (offset - loan) at atMonth. The offset keeps accumulating after payoff, and from then on it
  // also keeps the repayment no longer paid. A loan missing past payoff counts as 0, and an unpaid loan has
  // a point for every month up to the 600-month horizon.
  const m = Math.max(0, Math.min(600, Math.floor(p.atMonth)));
  const freed = p.mortgage.monthlyRepaymentCents + p.mortgage.extraMonthlyCents;
  const netAt = (r: typeof base, growthCents: number) => {
    let offset = Math.max(0, p.mortgage.offsetCents);
    for (let i = 1; i <= m; i++) {
      offset = Math.max(0, offset + growthCents);
      if (r.payoffMonth !== null && i > r.payoffMonth) offset += freed;
    }
    const loan = r.points[m]?.balanceCents ?? (r.payoffMonth !== null ? 0 : r.points[r.points.length - 1]!.balanceCents);
    return offset - loan;
  };
  const offsetGainCents =
    netAt(boosted, p.mortgage.offsetGrowthCents + p.spareCents) - netAt(base, p.mortgage.offsetGrowthCents);
  // Both arms include the spare cash itself, so they compare like with like in net-worth terms.
  return { monthsSooner, extraEtfCents, offsetGainCents, etfGainCents: extraEtfCents };
}
