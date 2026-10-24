import { holdingsFromTrades, netWorth, sydneyDate, valueHoldings } from '@curly/core';
import type { Deps } from '../app';
import type { Db } from '../db/db';
import { makeHoldingsRepo } from '../db/holdings';
import { makeNetWorthRepo } from '../db/networth';
import { PriceError } from '../prices/yahoo';

/**
 * Its own invocation, so its own Workers Free budget of 50 outbound requests. A run costs at most 17: 2 queries to load the
 * CommSec account and trades, up to 10 price fetches, 3 to store prices and the balance, 2 for the snapshot.
 */
export const MAX_DAILY_CALLS = 20;
const MAX_SYMBOLS = 10;

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
      const rows: { symbol: string; date: string; closeMicros: number }[] = [];
      for (const { symbol } of held.slice(0, MAX_SYMBOLS)) {
        try {
          count();
          const closes = await deps.prices.closes(symbol);
          for (const c of closes) rows.push({ symbol, ...c });
          if (closes.length) prices++;
        } catch (e) {
          // Status only: the error text could echo connection details.
          console.error('price failed', e instanceof PriceError ? e.status : 'error');
        }
      }
      await holdings.upsertPrices(rows);
      const closes = await holdings.latestCloses(held.map((h) => h.symbol));
      const value = valueHoldings(held, closes).reduce((n, h) => n + h.valueCents, 0);
      await holdings.setCommsecBalance(accountId, value, today);
    }
  } catch (e) {
    console.error('prices failed', e instanceof PriceError ? e.status : 'error');
  }

  const nw = makeNetWorthRepo(db);
  const t = netWorth(await nw.accounts(), today);
  await nw.upsertSnapshot(today, t.ownCents, t.oweCents);
  return { prices, snapshot: true };
}
