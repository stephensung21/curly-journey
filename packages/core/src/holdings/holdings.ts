import { minusMonths } from '../dates';
import type { ParsedTrade } from './commsec';

export type EtfHolding = { symbol: string; units: number; costCents: number };

export type ValuedEtfHolding = EtfHolding & {
  closeMicros: number | null;
  priceDate: string | null;
  valueCents: number;
  avgCostMicros: number;
  gainCents: number;
  gainBps: number;
};

/** Divide BigInts, rounding half away from zero. d must be positive. */
function divRound(n: bigint, d: bigint): bigint {
  const neg = n < 0n;
  const q = (2n * (neg ? -n : n) + d) / (2n * d);
  return neg ? -q : q;
}

/** Average-cost holdings. Date order, buys before sells on a date; over-sells floor at 0. */
export function holdingsFromTrades(
  trades: Pick<ParsedTrade, 'date' | 'side' | 'symbol' | 'units' | 'totalCents'>[],
): EtfHolding[] {
  const sorted = [...trades].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.side === b.side ? 0 : a.side === 'buy' ? -1 : 1,
  );
  const held = new Map<string, { units: number; costCents: number }>();
  for (const t of sorted) {
    const h = held.get(t.symbol) ?? { units: 0, costCents: 0 };
    if (t.side === 'buy') {
      h.units += t.units;
      h.costCents += t.totalCents;
    } else if (t.units >= h.units) {
      h.units = 0;
      h.costCents = 0;
    } else {
      const removed = Number(divRound(BigInt(h.costCents) * BigInt(t.units), BigInt(h.units)));
      h.units -= t.units;
      h.costCents -= removed;
    }
    held.set(t.symbol, h);
  }
  return [...held.entries()]
    .filter(([, h]) => h.units > 0)
    .map(([symbol, h]) => ({ symbol, units: h.units, costCents: h.costCents }))
    .sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
}

export function valueHoldings(
  h: EtfHolding[],
  closes: Map<string, { closeMicros: number; date: string }>,
): ValuedEtfHolding[] {
  return h.map((x) => {
    const close = closes.get(x.symbol);
    const avgCostMicros = x.units > 0 ? Number(divRound(BigInt(x.costCents) * 10000n, BigInt(x.units))) : 0;
    const valueCents = close
      ? Number(divRound(BigInt(x.units) * BigInt(close.closeMicros), 10000n))
      : x.costCents;
    const gainCents = valueCents - x.costCents;
    const gainBps = x.costCents > 0 ? Number(divRound(BigInt(gainCents) * 10000n, BigInt(x.costCents))) : 0;
    return {
      ...x,
      closeMicros: close ? close.closeMicros : null,
      priceDate: close ? close.date : null,
      valueCents,
      avgCostMicros,
      gainCents,
      gainBps,
    };
  });
}

/** Net money put in over the 12 months to `today`, per month (buys minus sells, rounded). */
export function avgMonthlyInvestmentCents(
  trades: Pick<ParsedTrade, 'date' | 'side' | 'totalCents'>[],
  today: string,
): number {
  const from = minusMonths(today, 12);
  let net = 0;
  for (const t of trades) {
    if (t.date > from) net += t.side === 'buy' ? t.totalCents : -t.totalCents;
  }
  return Number(divRound(BigInt(net), 12n));
}
