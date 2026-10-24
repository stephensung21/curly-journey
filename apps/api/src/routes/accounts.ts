import { isManualStale, isStale, sydneyDate } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeManualRepo } from '../db/manual';
import { makeRepo, type AccountSettingsPatch } from '../db/repo';
import { isObject, parseId, readJson } from './http';

const BOOLS = ['countsSpending', 'countsNetWorth', 'isOffset'] as const;
const PROJECTIONS = ['off', 'etf', 'mortgage'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function parsePatch(body: unknown): AccountSettingsPatch | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const allowed = new Set<string>([...BOOLS, 'projections', 'displayName', 'icon', 'growthBps']);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!allowed.has(k)) return null;
    if ((BOOLS as readonly string[]).includes(k)) {
      if (typeof v !== 'boolean') return null;
    } else if (k === 'projections') {
      if (typeof v !== 'string' || !PROJECTIONS.includes(v)) return null;
    } else if (k === 'growthBps') {
      if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < -2000 || v > 2000)) return null;
    } else if (k === 'icon') {
      if (v !== null) {
        if (typeof v !== 'string') return null;
        const t = v.trim();
        if (t.length < 1 || t.length > 8) return null;
        out[k] = t;
        continue;
      }
    } else if (v !== null && typeof v !== 'string') {
      return null;
    }
    out[k] = v;
  }
  return out as AccountSettingsPatch;
}

type ManualValueInput = { valueCents: number; asOf: string };

function parseValue(body: Record<string, unknown>, today: string): ManualValueInput | null {
  const { valueCents, asOf } = body;
  if (typeof valueCents !== 'number' || !Number.isSafeInteger(valueCents) || Math.abs(valueCents) > 1e12) return null;
  if (typeof asOf !== 'string' || !ISO_DATE.test(asOf) || asOf > today) return null;
  // Rejects dates like 2026-02-30 that the pattern allows but the calendar does not.
  if (new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) !== asOf) return null;
  return { valueCents, asOf };
}

export function accountRoutes(deps: Deps) {
  const r = new Hono();
  const repo = makeRepo(deps.db);
  const manual = makeManualRepo(deps.db);

  r.get('/accounts', async (c) => {
    const [accounts, last] = await Promise.all([repo.listAccounts(), repo.lastSuccessfulSync()]);
    const now = deps.now();
    const today = sydneyDate(now);
    const globalStale = isStale(last?.finishedAt ?? null, now);
    return c.json({
      accounts: accounts.map((a) => ({
        ...a,
        stale:
          (a.source === 'pocketsmith' && globalStale) ||
          (a.source === 'coinspot' && isStale(a.syncedAt === null ? null : new Date(a.syncedAt), now)),
        needsUpdate: a.source === 'manual' && isManualStale(a.balanceDate, today),
      })),
      lastSuccessAt: last ? last.finishedAt.toISOString() : null,
    });
  });

  r.post('/accounts/manual', async (c) => {
    const body = await readJson(c);
    const v = isObject(body) ? parseValue(body, sydneyDate(deps.now())) : null;
    const { name, icon } = isObject(body) ? body : ({} as Record<string, unknown>);
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanIcon = typeof icon === 'string' ? icon.trim() : icon;
    if (
      !v ||
      cleanName.length < 1 ||
      cleanName.length > 60 ||
      !(cleanIcon === null || (typeof cleanIcon === 'string' && cleanIcon.length >= 1 && cleanIcon.length <= 8))
    ) {
      return c.json({ error: 'bad_manual' }, 400);
    }
    return c.json(await manual.create({ name: cleanName, icon: cleanIcon, ...v }), 201);
  });

  r.put('/accounts/order', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_json' }, 400);
    }
    const ids = typeof body === 'object' && body !== null ? (body as { ids?: unknown }).ids : undefined;
    if (!Array.isArray(ids) || !ids.every((n) => Number.isInteger(n) && n > 0 && n <= 2147483647)) {
      return c.json({ error: 'bad_order' }, 400);
    }
    if (!(await repo.setAccountOrder(ids as number[]))) return c.json({ error: 'bad_order' }, 400);
    return c.json({ ok: true });
  });

  r.patch('/accounts/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'bad_json' }, 400);
    }
    const patch = parsePatch(body);
    if (!patch) return c.json({ error: 'bad_patch' }, 400);
    if (patch.growthBps !== undefined) {
      // Growth is a guess about a hand-entered value, so synced accounts never take it.
      const account = await repo.getAccount(id);
      if (!account) return c.json({ error: 'account_not_found' }, 404);
      if (account.source !== 'manual') return c.json({ error: 'not_manual' }, 400);
    }
    const updated = await repo.updateAccountSettings(id, patch);
    if (!updated) return c.json({ error: 'account_not_found' }, 404);
    return c.json(updated);
  });

  r.put('/accounts/:id/value', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    const body = await readJson(c);
    const v = isObject(body) ? parseValue(body, sydneyDate(deps.now())) : null;
    if (!v) return c.json({ error: 'bad_manual' }, 400);
    const account = await repo.getAccount(id);
    if (!account) return c.json({ error: 'account_not_found' }, 404);
    if (account.source !== 'manual') return c.json({ error: 'not_manual' }, 400);
    const updated = await manual.setValue(id, v.valueCents, v.asOf);
    if (!updated) return c.json({ error: 'account_not_found' }, 404);
    return c.json(updated);
  });

  r.get('/accounts/:id/values', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    if (!(await repo.getAccount(id))) return c.json({ error: 'account_not_found' }, 404);
    return c.json({ values: await manual.values(id) });
  });

  r.get('/accounts/:id/holdings', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    if (!(await repo.getAccount(id))) return c.json({ error: 'account_not_found' }, 404);
    return c.json({ holdings: await manual.holdings(id) });
  });

  r.delete('/accounts/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    const account = await repo.getAccount(id);
    if (!account) return c.json({ error: 'account_not_found' }, 404);
    if (account.source !== 'manual') return c.json({ error: 'not_manual' }, 400);
    await manual.remove(id);
    return c.body(null, 204);
  });

  r.get('/accounts/:id/transactions', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    const month = c.req.query('month') ?? '';
    if (!MONTH.test(month)) return c.json({ error: 'bad_month' }, 400);
    if (!(await repo.getAccount(id))) return c.json({ error: 'account_not_found' }, 404);
    return c.json({ transactions: await repo.listTransactions(id, month) });
  });

  return r;
}
