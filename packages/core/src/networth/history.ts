import { addDays, daysBetween, shiftMonths } from '../dates';
import type { ParsedTrade } from '../holdings/commsec';
import { holdingsFromTrades } from '../holdings/holdings';
import { rangeStart, type NwAccount, type NwRange } from './networth';

export type HistoryInput = {
  /** Accounts that count toward net worth, with today's balances. */
  accounts: NwAccount[];
  /** Money in (+) and out (-) per account per day. */
  flows: { accountId: number; date: string; amountCents: number }[];
  trades: Pick<ParsedTrade, 'date' | 'side' | 'symbol' | 'units' | 'totalCents' | 'priceMicros'>[];
  commsecAccountId: number | null;
  /** The latest close on or before the date, or null when none is stored. */
  closeAt: (symbol: string, date: string) => number | null;
};

function monthEnd(iso: string): string {
  return addDays(shiftMonths(`${iso.slice(0, 7)}-01`, 1), -1);
}

/**
 * Past dates to chart, oldest first, before today: the range start, then weekly for 1M or each month end otherwise.
 * 'All' starts at the earliest data; with none there are no past points.
 */
export function historyDates(range: NwRange, today: string, earliest: string | null): string[] {
  const start = rangeStart(range, today) ?? earliest;
  if (start === null || start >= today) return [];
  const out = [start];
  if (range === '1M') {
    for (let d = addDays(start, 7); d < today; d = addDays(d, 7)) out.push(d);
    return out;
  }
  for (let d = monthEnd(start); d < today; d = monthEnd(addDays(d, 1))) if (d !== start) out.push(d);
  return out;
}

/** CommSec value on a date: units held then, at the close then, or the last trade price when no close is stored. */
function commsecAt(input: HistoryInput, date: string): number {
  const upTo = input.trades.filter((t) => t.date <= date);
  let cents = 0;
  for (const h of holdingsFromTrades(upTo)) {
    const lastTrade = upTo.filter((t) => t.symbol === h.symbol).reduce((a, b) => (b.date >= a.date ? b : a));
    const micros = input.closeAt(h.symbol, date) ?? lastTrade.priceMicros;
    cents += Math.round((h.units * micros) / 10_000);
  }
  return cents;
}

/**
 * Net worth on each date, rebuilt from today's balances: bank and loan balances wound back by the transactions since,
 * CommSec from the trades and closes, manual values grown backwards from their as-of date. Accounts with no
 * transactions (CoinSpot, manual with no growth) keep today's value.
 */
export function netWorthHistory(input: HistoryInput, dates: string[]): { date: string; totalCents: number }[] {
  const totals = dates.map(() => 0);
  const flowsBy = new Map<number, { date: string; amountCents: number }[]>();
  for (const f of input.flows) flowsBy.set(f.accountId, [...(flowsBy.get(f.accountId) ?? []), f]);
  const newestFirst = dates.map((d, i) => ({ d, i })).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
  for (const a of input.accounts) {
    if (!a.countsNetWorth) continue;
    if (a.id === input.commsecAccountId) {
      dates.forEach((d, i) => (totals[i]! += commsecAt(input, d)));
    } else if (a.source === 'manual') {
      dates.forEach((d, i) => {
        totals[i]! +=
          a.growthBps !== null && a.balanceDate !== null
            ? Math.round(a.balanceCents * Math.pow(1 + a.growthBps / 10_000, daysBetween(a.balanceDate, d) / 365.25))
            : a.balanceCents;
      });
    } else {
      // Walk dates newest first, undoing each transaction dated after the point and on or before the balance date.
      const asOf = a.balanceDate ?? '9999-12-31';
      const flows = (flowsBy.get(a.id) ?? []).filter((f) => f.date <= asOf).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
      let v = a.balanceCents;
      let k = 0;
      for (const { d, i } of newestFirst) {
        while (k < flows.length && flows[k]!.date > d) v -= flows[k++]!.amountCents;
        totals[i]! += v;
      }
    }
  }
  return dates.map((date, i) => ({ date, totalCents: totals[i]! }));
}
