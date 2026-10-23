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
    return c.json({ status: res.status, accounts: res.accounts, transactions: res.transactions });
  });

  r.get('/sync/status', async (c) => {
    const last = await makeRepo(deps.db).lastSuccessfulSync();
    const rows = await deps.db.query<{ status: 'ok' | 'failed' | 'running' }>(
      'select status from sync_log order by started_at desc, id desc limit 1',
    );
    return c.json({
      lastSuccessAt: last ? last.finishedAt.toISOString() : null,
      lastStatus: rows[0]?.status ?? null,
      stale: isStale(last?.finishedAt ?? null, deps.now()),
    });
  });

  return r;
}
