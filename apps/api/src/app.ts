import { Hono } from 'hono';
import { bearerAuth } from './auth';
import type { Db } from './db/db';
import type { PocketSmithClient } from './pocketsmith';

export type Deps = { db: Db; pocketsmith: PocketSmithClient; now: () => Date };

export function createApp(deps: Deps) {
  const app = new Hono();
  app.get('/health', (c) => c.json({ ok: true }));
  app.use('*', bearerAuth(deps.db));
  app.get('/accounts', (c) => c.json([]));
  return app;
}
