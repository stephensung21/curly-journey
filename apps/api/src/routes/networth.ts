import { historyDates, netWorth, netWorthHistory, sinceNote, sydneyDate, type NwRange } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeHoldingsRepo } from '../db/holdings';
import { makeNetWorthRepo } from '../db/networth';

const RANGES: readonly string[] = ['1M', '6M', '1Y', 'All'];

export function netWorthRoutes(deps: Deps) {
  const r = new Hono();
  const repo = makeNetWorthRepo(deps.db);
  const holdings = makeHoldingsRepo(deps.db);

  r.get('/networth', async (c) => {
    const range = c.req.query('range') ?? '6M';
    if (!RANGES.includes(range)) return c.json({ error: 'bad_range' }, 400);
    const today = sydneyDate(deps.now());
    const [accounts, earliest, commsecAccountId] = await Promise.all([
      repo.accounts(),
      range === 'All' ? repo.earliestDate() : Promise.resolve(null),
      holdings.commsecAccountId(),
    ]);
    const live = netWorth(accounts, today);
    // Past points are rebuilt from today's balances, so data added late still counts back to when it happened.
    const dates = historyDates(range as NwRange, today, earliest);
    const [flows, trades] = await Promise.all([
      dates.length ? repo.flows(dates[0]!) : Promise.resolve([]),
      commsecAccountId !== null && dates.length ? holdings.trades(commsecAccountId) : Promise.resolve([]),
    ]);
    const closes = await holdings.closesAt([...new Set(trades.map((t) => t.symbol))], dates);
    const past = netWorthHistory(
      { accounts, flows, trades, commsecAccountId, closeAt: (s, d) => closes.get(`${s}|${d}`) ?? null },
      dates,
    );
    // Today's point is always the live total, so headline, chart end and since-note agree.
    const history = [...past, { date: today, totalCents: live.totalCents }];
    return c.json({ ...live, history, since: sinceNote(history) });
  });

  return r;
}
