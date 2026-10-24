import { limitStatuses, monthPeriod, summarise } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeLimitsRepo } from '../db/limits';
import { makeRepo } from '../db/repo';
import { isObject, parseId, readJson } from './http';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DEFAULT_WARN = 80;

const validAmount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const validWarn = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 50 && v <= 99;

export function limitRoutes(deps: Deps) {
  const r = new Hono();
  const repo = makeRepo(deps.db);
  const limits = makeLimitsRepo(deps.db);

  r.get('/limits', async (c) => {
    const month = c.req.query('month') ?? '';
    if (!MONTH.test(month)) return c.json({ error: 'bad_month' }, 400);
    const [all, lines, alerted] = await Promise.all([
      limits.list(),
      repo.spendLines(monthPeriod(month)),
      limits.alertedAt(month),
    ]);
    const out = limitStatuses(all, summarise(lines)).map((s) => ({ ...s, alertedAt: alerted.get(s.id) ?? null }));
    return c.json({ limits: out });
  });

  r.post('/limits', async (c) => {
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    if (!isObject(body)) return c.json({ error: 'bad_limit' }, 400);
    const { categoryId, amountCents } = body;
    const warnPercent = body.warnPercent === undefined ? DEFAULT_WARN : body.warnPercent;
    if (
      !(categoryId === null || (typeof categoryId === 'number' && Number.isSafeInteger(categoryId))) ||
      !validAmount(amountCents) ||
      !validWarn(warnPercent)
    ) {
      return c.json({ error: 'bad_limit' }, 400);
    }
    if (categoryId !== null) {
      const cat = (await repo.listCategories()).find((x) => x.id === categoryId);
      if (!cat || cat.kind !== 'spending') return c.json({ error: 'category_not_found' }, 400);
    }
    const created = await limits.create({ categoryId, amountCents, warnPercent });
    if (!created) return c.json({ error: 'limit_exists' }, 409);
    return c.json(created, 201);
  });

  r.patch('/limits/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    if (!isObject(body)) return c.json({ error: 'bad_limit' }, 400);
    if (
      (body.amountCents !== undefined && !validAmount(body.amountCents)) ||
      (body.warnPercent !== undefined && !validWarn(body.warnPercent))
    ) {
      return c.json({ error: 'bad_limit' }, 400);
    }
    const updated = await limits.update(id, {
      amountCents: body.amountCents as number | undefined,
      warnPercent: body.warnPercent as number | undefined,
    });
    if (!updated) return c.json({ error: 'limit_not_found' }, 404);
    return c.json(updated);
  });

  r.delete('/limits/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    if (!(await limits.remove(id))) return c.json({ error: 'limit_not_found' }, 404);
    return c.body(null, 204);
  });

  return r;
}
