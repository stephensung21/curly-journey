import type { Flow } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeRepo, type NewRule } from '../db/repo';
import { isObject, parseId, readJson } from './http';

const FLOWS: Flow[] = ['normal', 'transfer', 'mortgage', 'not_spending'];

/** An optional integer body field: null when absent, undefined when malformed. */
const optInt = (v: unknown): number | null | undefined =>
  v === undefined || v === null ? null : typeof v === 'number' && Number.isInteger(v) ? v : undefined;

/** An optional integer query param: null when absent, undefined when malformed. */
function queryInt(raw: string | undefined): number | null | undefined {
  if (raw === undefined || raw === '') return null;
  return /^-?\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : undefined;
}

const validMatchText = (v: unknown): v is string => typeof v === 'string' && v.length >= 3 && v.length <= 60;

export function ruleRoutes(deps: Deps) {
  const r = new Hono();
  const repo = makeRepo(deps.db);

  r.get('/rules', async (c) => c.json({ rules: await repo.listRulesWithMatches() }));

  r.get('/rules/preview', async (c) => {
    const matchText = c.req.query('matchText')?.trim();
    if (!validMatchText(matchText)) return c.json({ error: 'bad_match_text' }, 400);
    const accountId = queryInt(c.req.query('accountId'));
    const amountCents = queryInt(c.req.query('amountCents'));
    const categoryId = queryInt(c.req.query('categoryId'));
    if (accountId === undefined || amountCents === undefined || categoryId === undefined) {
      return c.json({ error: 'bad_rule' }, 400);
    }
    return c.json({ matches: await repo.previewRule({ matchText, accountId, amountCents }, categoryId) });
  });

  r.post('/rules', async (c) => {
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    if (!isObject(body)) return c.json({ error: 'bad_rule' }, 400);
    const matchText = typeof body.matchText === 'string' ? body.matchText.trim() : body.matchText;
    if (!validMatchText(matchText)) return c.json({ error: 'bad_match_text' }, 400);

    const accountId = optInt(body.accountId);
    const amountCents = optInt(body.amountCents);
    const categoryId = optInt(body.categoryId);
    const flow = body.flow === undefined || body.flow === null ? null : body.flow;
    if (
      (body.origin !== 'user' && body.origin !== 'learned') ||
      accountId === undefined || amountCents === undefined || categoryId === undefined ||
      (flow !== null && (typeof flow !== 'string' || !FLOWS.includes(flow as Flow))) ||
      (categoryId === null && flow === null) ||
      typeof body.applyToPast !== 'boolean'
    ) {
      return c.json({ error: 'bad_rule' }, 400);
    }
    if (categoryId !== null && !(await repo.listCategories()).some((cat) => cat.id === categoryId)) {
      return c.json({ error: 'bad_category' }, 400);
    }
    if (accountId !== null && !(await repo.getAccount(accountId))) return c.json({ error: 'account_not_found' }, 404);

    const rule: NewRule = { origin: body.origin, matchText, accountId, amountCents, categoryId, flow: flow as Flow | null };
    return c.json(await repo.createRule(rule, body.applyToPast), 201);
  });

  r.delete('/rules/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    if (!(await repo.deleteRule(id))) return c.json({ error: 'rule_not_found' }, 404);
    return c.body(null, 204);
  });

  return r;
}
