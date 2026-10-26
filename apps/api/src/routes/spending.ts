import {
  addMonths,
  inOutByMonth,
  institutionGroup,
  mapPocketSmithCategory,
  merchantCategory,
  monthPeriod,
  runningByDay,
  statementPeriod,
  summarise,
  type SpendLine,
} from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeRepo } from '../db/repo';
import { categoryIdByName } from '../spending/categoryNames';
import { parseId } from './http';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const INBOX_LIMIT = 50;
const MAX_GUESSES = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const sydneyDate = (d: Date): string => d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

export function spendingRoutes(deps: Deps) {
  const r = new Hono();
  const repo = makeRepo(deps.db);

  r.get('/spending', async (c) => {
    const month = c.req.query('month') ?? '';
    if (!MONTH.test(month)) return c.json({ error: 'bad_month' }, 400);
    const period = c.req.query('period');
    if (period !== undefined && period !== 'statement') return c.json({ error: 'bad_period' }, 400);
    const accountIdParam = c.req.query('accountId');
    const accountId = accountIdParam === undefined ? undefined : parseId(accountIdParam);
    if (accountId === null) return c.json({ error: 'bad_id' }, 400);
    if (period === 'statement' && accountId === undefined) return c.json({ error: 'bad_period' }, 400);

    let accountIds = accountId === undefined ? undefined : [accountId];
    const institution = c.req.query('institution');
    if (institution !== undefined) {
      const matching = (await repo.listAccounts())
        .filter((a) => institutionGroup(a.institution) === institution && (accountId !== undefined || a.countsSpending))
        .map((a) => a.id);
      accountIds = accountIds ? accountIds.filter((id) => matching.includes(id)) : matching;
    }

    const periodOf = period === 'statement' ? statementPeriod : monthPeriod;
    const cur = periodOf(month);
    const prev = periodOf(addMonths(month, -1));
    // Both periods in one query, split by date afterwards.
    const lines = await repo.spendLines({ from: prev.from, to: cur.to, accountIds });
    const inPeriod = (p: { from: string; to: string }) => (l: SpendLine) => l.date >= p.from && l.date <= p.to;
    const before = summarise(lines.filter(inPeriod(prev)));
    return c.json({
      ...summarise(lines.filter(inPeriod(cur))),
      from: cur.from,
      to: cur.to,
      prevTotalCents: before.totalCents,
      // So the app can compare like with like when mortgage and card payments are switched on.
      prevMortgageCents: before.mortgageCents,
      prevCardPaymentCents: before.cardPaymentCents,
    });
  });

  r.get('/spending/inout', async (c) => {
    const end = c.req.query('end') ?? '';
    if (!MONTH.test(end)) return c.json({ error: 'bad_month' }, 400);
    const monthsParam = c.req.query('months') ?? '6';
    const count = /^\d+$/.test(monthsParam) ? Number(monthsParam) : 0;
    if (count < 1 || count > 12) return c.json({ error: 'bad_months' }, 400);

    const months = Array.from({ length: count }, (_, i) => addMonths(end, i + 1 - count));
    const lines = await repo.spendLines({ from: monthPeriod(months[0]!).from, to: monthPeriod(end).to });
    return c.json({ months: inOutByMonth(lines, months) });
  });

  r.get('/spending/daily', async (c) => {
    const month = c.req.query('month') ?? '';
    if (!MONTH.test(month)) return c.json({ error: 'bad_month' }, 400);
    const lines = await repo.spendLines(monthPeriod(month));
    return c.json({ days: runningByDay(lines, month, sydneyDate(deps.now())) });
  });

  r.get('/inbox', async (c) => {
    const { items, total } = await repo.inbox(INBOX_LIMIT);
    const since = sydneyDate(new Date(deps.now().getTime() - 90 * DAY_MS));
    const [userByMerchant, top, categories] = await Promise.all([
      repo.userCategoryByMerchant([...new Set(items.map((t) => t.merchant).filter(Boolean))]),
      repo.topCategoriesSince(since, MAX_GUESSES),
      repo.categoryNames(),
    ]);
    const byName = categoryIdByName(categories);
    const named = (name: string | null) => (name === null ? null : (byName.get(name) ?? null));

    const withGuesses = items.map((t) => {
      const ordered = [
        userByMerchant.get(t.merchant) ?? null,
        named(merchantCategory(t.merchant)),
        named(mapPocketSmithCategory(t.psCategory)),
        ...top,
      ];
      const guesses: number[] = [];
      for (const id of ordered) {
        if (id !== null && !guesses.includes(id)) guesses.push(id);
        if (guesses.length === MAX_GUESSES) break;
      }
      const { psCategory: _ps, ...dto } = t;
      return { ...dto, guesses };
    });
    return c.json({ items: withGuesses, total });
  });

  r.get('/stats/categorisation', async (c) => {
    const since = new Date(deps.now().getTime() - 30 * DAY_MS);
    const { total, auto } = await repo.categorisationSince(since);
    return c.json({ autoPercent: total === 0 ? null : Math.round((100 * auto) / total), sample: total });
  });

  return r;
}
