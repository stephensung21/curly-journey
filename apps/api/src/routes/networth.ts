import { netWorth, rangeStart, sinceNote, sydneyDate, type NwRange } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeNetWorthRepo } from '../db/networth';

const RANGES: readonly string[] = ['1M', '6M', '1Y', 'All'];

export function netWorthRoutes(deps: Deps) {
  const r = new Hono();
  const repo = makeNetWorthRepo(deps.db);

  r.get('/networth', async (c) => {
    const range = c.req.query('range') ?? '6M';
    if (!RANGES.includes(range)) return c.json({ error: 'bad_range' }, 400);
    const today = sydneyDate(deps.now());
    const [accounts, snapshots] = await Promise.all([repo.accounts(), repo.history(rangeStart(range as NwRange, today))]);
    const live = netWorth(accounts, today);
    // Today's point is always the live total, so headline, chart end and since-note agree.
    const history = [...snapshots.filter((p) => p.date !== today), { date: today, totalCents: live.totalCents }];
    return c.json({ ...live, history, since: sinceNote(history) });
  });

  return r;
}
