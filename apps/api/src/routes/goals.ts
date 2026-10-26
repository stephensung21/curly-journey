import { addDays, fiProgress, goalProgress, summarise } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeGoalsRepo, type Goal } from '../db/goals';
import { makeRepo } from '../db/repo';
import { isObject, parseId, readJson } from './http';

const MAX_TARGET_CENTS = 1_000_000_000_000;
const MAX_ACCOUNTS = 50;

const sydneyDate = (d: Date): string => d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

const validDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

type Fields = Omit<Goal, 'id'>;

/** Validated fields: all of them when `full` (defaults filled in), else only those present. Null when invalid. */
function parseFields(body: Record<string, unknown>, full: boolean): Partial<Fields> | null {
  const out: Partial<Fields> = {};
  const has = (k: string) => k in body && body[k] !== undefined;
  if (full && (!has('name') || !has('targetCents'))) return null;
  if (has('name')) {
    if (typeof body.name !== 'string') return null;
    const name = body.name.trim();
    if (name.length < 1 || name.length > 60) return null;
    out.name = name;
  }
  if (has('emoji')) {
    if (typeof body.emoji !== 'string') return null;
    const len = [...body.emoji].length;
    if (len < 1 || len > 8) return null;
    out.emoji = body.emoji;
  } else if (full) out.emoji = '🎯';
  if (has('targetCents')) {
    const v = body.targetCents;
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > MAX_TARGET_CENTS) return null;
    out.targetCents = v;
  }
  if (has('targetDate')) {
    if (body.targetDate !== null && !validDate(body.targetDate)) return null;
    out.targetDate = body.targetDate as string | null;
  } else if (full) out.targetDate = null;
  if (has('accountIds')) {
    const v = body.accountIds;
    if (!Array.isArray(v) || v.length > MAX_ACCOUNTS || !v.every((id) => typeof id === 'number' && Number.isInteger(id) && id > 0)) {
      return null;
    }
    out.accountIds = [...new Set(v as number[])];
  } else if (full) out.accountIds = [];
  return out;
}

export function goalRoutes(deps: Deps) {
  const r = new Hono();
  const goals = makeGoalsRepo(deps.db);
  const repo = makeRepo(deps.db);

  const accountsExist = async (ids: number[] | undefined) => !ids?.length || (await goals.existingAccounts(ids)).size === ids.length;

  r.get('/goals', async (c) => {
    const today = sydneyDate(deps.now());
    const [list, balances, lines] = await Promise.all([
      goals.list(),
      goals.balances(),
      repo.spendLines({ from: addDays(today, -364), to: today }),
    ]);
    const byId = new Map(balances.map((b) => [b.id, b.balanceCents]));
    const netWorth = balances.reduce((n, b) => n + b.balanceCents, 0);
    const invested = balances.filter((b) => b.invested).reduce((n, b) => n + b.balanceCents, 0);
    return c.json({
      goals: list.map((g) => {
        const currentCents = g.accountIds.length ? g.accountIds.reduce((n, id) => n + (byId.get(id) ?? 0), 0) : netWorth;
        return { ...g, currentCents, ...goalProgress(g, currentCents, today) };
      }),
      // A year of spending, as the Spending tab counts it (mortgage and card payments left out).
      fi: fiProgress(summarise(lines).totalCents, invested),
    });
  });

  r.post('/goals', async (c) => {
    const body = await readJson(c);
    if (!isObject(body)) return c.json({ error: 'bad_goal' }, 400);
    const fields = parseFields(body, true);
    if (!fields || !(await accountsExist(fields.accountIds))) return c.json({ error: 'bad_goal' }, 400);
    return c.json(await goals.create(fields as Fields), 201);
  });

  r.patch('/goals/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    const body = await readJson(c);
    if (!isObject(body)) return c.json({ error: 'bad_goal' }, 400);
    const fields = parseFields(body, false);
    if (!fields || !(await accountsExist(fields.accountIds))) return c.json({ error: 'bad_goal' }, 400);
    const updated = await goals.update(id, fields);
    if (!updated) return c.json({ error: 'goal_not_found' }, 404);
    return c.json(updated);
  });

  r.delete('/goals/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    if (!(await goals.remove(id))) return c.json({ error: 'goal_not_found' }, 404);
    return c.body(null, 204);
  });

  return r;
}
