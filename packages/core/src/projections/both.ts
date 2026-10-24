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
}): { monthsSooner: number | null; extraEtfCents: number } {
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
  return { monthsSooner, extraEtfCents: at(p.etf.monthlyCents + p.spareCents) - at(p.etf.monthlyCents) };
}
