import { institutionGroup, monthPeriod, statementPeriod, summarise, type Flow } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeRepo, type TransactionPatch } from '../db/repo';
import { isObject, parseId, readJson } from './http';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const FLOWS: Flow[] = ['normal', 'transfer', 'mortgage', 'not_spending'];

export function transactionRoutes(deps: Deps) {
  const r = new Hono();
  const repo = makeRepo(deps.db);

  r.get('/transactions', async (c) => {
    const month = c.req.query('month') ?? '';
    if (!MONTH.test(month)) return c.json({ error: 'bad_month' }, 400);

    const period = c.req.query('period');
    if (period !== undefined && period !== 'statement') return c.json({ error: 'bad_period' }, 400);
    const accountIdParam = c.req.query('accountId');
    const accountId = accountIdParam === undefined ? undefined : parseId(accountIdParam);
    if (accountId === null) return c.json({ error: 'bad_id' }, 400);
    if (period === 'statement' && accountId === undefined) return c.json({ error: 'bad_period' }, 400);

    const categoryParam = c.req.query('categoryId');
    let categoryId: number | 'none' | undefined;
    if (categoryParam !== undefined) {
      const parsed = categoryParam === 'none' ? 'none' : parseId(categoryParam);
      if (parsed === null) return c.json({ error: 'bad_category' }, 400);
      categoryId = parsed;
    }

    let accountIds = accountId === undefined ? undefined : [accountId];
    const institution = c.req.query('institution');
    if (institution !== undefined) {
      // Same scope as GET /spending, so a drill-down matches its bar.
      const matching = (await repo.listAccounts())
        .filter((a) => institutionGroup(a.institution) === institution && (accountId !== undefined || a.countsSpending))
        .map((a) => a.id);
      accountIds = accountIds ? accountIds.filter((id) => matching.includes(id)) : matching;
    }

    const { from, to } = period === 'statement' ? statementPeriod(month) : monthPeriod(month);
    const transactions = await repo.queryTransactions({ from, to, accountIds, categoryId });
    if (categoryId === undefined) return c.json({ transactions });
    // The category's Spending bar, from the same lines and summary as GET /spending: split parts count separately.
    const want = categoryId === 'none' ? null : categoryId;
    const lines = await repo.spendLines({ from, to, accountIds });
    const totalCents = summarise(lines).byCategory.find((b) => b.categoryId === want)?.cents ?? 0;
    return c.json({ transactions, totalCents });
  });

  r.get('/transactions/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    const txn = await repo.getTransaction(id);
    if (!txn) return c.json({ error: 'transaction_not_found' }, 404);
    return c.json(txn);
  });

  r.patch('/transactions/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    if (!isObject(body)) return c.json({ error: 'bad_patch' }, 400);

    const patch: TransactionPatch = {};
    for (const [k, v] of Object.entries(body)) {
      if (k === 'categoryId') {
        if (v !== null) {
          if (typeof v !== 'number' || !Number.isInteger(v)) return c.json({ error: 'bad_category' }, 400);
          if (!(await repo.listCategories()).some((cat) => cat.id === v)) return c.json({ error: 'bad_category' }, 400);
        }
        patch.categoryId = v as number | null;
      } else if (k === 'flow') {
        if (typeof v !== 'string' || !FLOWS.includes(v as Flow)) return c.json({ error: 'bad_flow' }, 400);
        patch.flow = v as Flow;
      } else if (k === 'note') {
        if (v !== null && (typeof v !== 'string' || v.length > 500)) return c.json({ error: 'bad_note' }, 400);
        patch.note = v;
      } else {
        return c.json({ error: 'bad_patch' }, 400);
      }
    }
    const updated = await repo.patchTransaction(id, patch);
    if (!updated) return c.json({ error: 'transaction_not_found' }, 404);
    return c.json(updated);
  });

  r.put('/transactions/:id/splits', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    if (!isObject(body) || !Array.isArray(body.splits)) return c.json({ error: 'bad_split' }, 400);
    const txn = await repo.getTransaction(id);
    if (!txn) return c.json({ error: 'transaction_not_found' }, 404);

    const parts: { categoryId: number; amountCents: number }[] = [];
    for (const p of body.splits as unknown[]) {
      if (
        !isObject(p) ||
        typeof p.categoryId !== 'number' || !Number.isInteger(p.categoryId) ||
        typeof p.amountCents !== 'number' || !Number.isInteger(p.amountCents) ||
        p.amountCents === 0 || Math.sign(p.amountCents) !== Math.sign(txn.amountCents)
      ) {
        return c.json({ error: 'bad_split' }, 400);
      }
      parts.push({ categoryId: p.categoryId, amountCents: p.amountCents });
    }
    if (parts.length === 1) return c.json({ error: 'bad_split' }, 400);
    if (parts.length) {
      const known = new Set((await repo.listCategories()).map((cat) => cat.id));
      if (parts.some((p) => !known.has(p.categoryId))) return c.json({ error: 'bad_category' }, 400);
      if (parts.reduce((sum, p) => sum + p.amountCents, 0) !== txn.amountCents) {
        return c.json({ error: 'bad_split_total' }, 400);
      }
    }
    return c.json(await repo.setSplits(id, parts));
  });

  return r;
}
