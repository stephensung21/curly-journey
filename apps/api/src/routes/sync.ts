import { isStale } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeRepo } from '../db/repo';
import { runSync } from '../sync/runSync';

export function syncRoutes(deps: Deps) {
  const r = new Hono();

  r.post('/sync', async (c) => {
    const res = await runSync(deps);
    if (res.status === 'skipped') return c.json({ error: 'sync_in_progress' }, 409);
    if (res.status === 'failed') return c.json({ error: 'sync_failed' }, 502);
    return c.json({ status: res.status, accounts: res.accounts, transactions: res.transactions, more: res.more });
  });

  r.get('/sync/status', async (c) => {
    const last = await makeRepo(deps.db).lastSuccessfulSync();
    const lastStatus = await makeRepo(deps.db).lastSyncStatus();
    return c.json({
      lastSuccessAt: last ? last.finishedAt.toISOString() : null,
      lastStatus,
      stale: isStale(last?.finishedAt ?? null, deps.now()),
    });
  });

  return r;
}
