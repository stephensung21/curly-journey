import { addDays, holdingsFromTrades, netWorth, sydneyDate, valueHoldings } from '@curly/core';
import type { Deps } from '../app';
import type { Db } from '../db/db';
import { makeHoldingsRepo } from '../db/holdings';
import { makeNetWorthRepo } from '../db/networth';
import { PriceError } from '../prices/yahoo';

/**
 * Its own invocation, so its own Workers Free budget of 50 outbound requests. A run costs at most 18: 2 queries to load the
 * CommSec account and trades, 1 for stored price coverage, up to 10 price fetches, 3 to store prices and the balance, 2 for the snapshot.
 */
export const MAX_DAILY_CALLS = 20;
/** ETFs priced per run. Held ones come first, in symbol order, so any past this many are the last alphabetically. */
export const MAX_SYMBOLS = 10;

export async function runDaily(deps: Deps): Promise<{ prices: number; snapshot: boolean }> {
  let used = 0;
  const count = () => {
    if (++used > MAX_DAILY_CALLS) throw new Error('call budget exhausted');
  };
  const db: Db = {
    query(text, params) {
      count();
      return deps.db.query(text, params);
    },
  };
  const holdings = makeHoldingsRepo(db);
  const today = sydneyDate(deps.now());
  let prices = 0;

  // Prices are best effort: whatever goes wrong here, the snapshot below is still written.
  try {
    const accountId = await holdings.commsecAccountId();
    if (accountId !== null && deps.prices) {
      const trades = await holdings.trades(accountId);
      const held = holdingsFromTrades(trades);
      // Every symbol ever traded, held ones first. Past net worth needs closes back to each first trade.
      const firstTrade = new Map<string, string>();
      for (const t of trades) if (!firstTrade.has(t.symbol) || t.date < firstTrade.get(t.symbol)!) firstTrade.set(t.symbol, t.date);
      const heldSet = new Set(held.map((h) => h.symbol));
      const symbols = [...heldSet, ...[...firstTrade.keys()].filter((s) => !heldSet.has(s)).sort()];
      const firstClose = await holdings.firstCloseDates(symbols);
      const rows: { symbol: string; date: string; closeMicros: number }[] = [];
      let fetched = 0;
      for (const symbol of symbols) {
        const from = addDays(firstTrade.get(symbol)!, -7);
        const stored = firstClose.get(symbol);
        const needHistory = stored === undefined || stored > addDays(from, 7);
        if (!needHistory && !heldSet.has(symbol)) continue;
        if (fetched++ >= MAX_SYMBOLS) break;
        try {
          count();
          const closes = await deps.prices.closes(symbol, needHistory ? from : undefined);
          for (const c of closes) rows.push({ symbol, ...c });
          if (closes.length) prices++;
        } catch (e) {
          // Status only: the error text could echo connection details.
          console.error('price failed', e instanceof PriceError ? e.status : 'error');
        }
      }
      await holdings.upsertPrices(rows);
      const closes = await holdings.latestCloses(held.map((h) => h.symbol));
      const valued = valueHoldings(held, closes);
      const value = valued.reduce((n, h) => n + h.valueCents, 0);
      // Dated by the oldest price behind it, so a failed price fetch doesn't pass old prices off as today's.
      const dates = valued.map((h) => h.priceDate).filter((d): d is string => d !== null);
      await holdings.setCommsecBalance(accountId, value, dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : today);
    }
  } catch (e) {
    console.error('prices failed', e instanceof PriceError ? e.status : 'error');
  }

  const nw = makeNetWorthRepo(db);
  const t = netWorth(await nw.accounts(), today);
  await nw.upsertSnapshot(today, t.ownCents, t.oweCents);
  return { prices, snapshot: true };
}
