import { Hono } from 'hono';
import { bearerAuth } from './auth';
import type { Db } from './db/db';
import type { PocketSmithClient } from './pocketsmith';
import { makeRepo } from './db/repo';
import { accountRoutes } from './routes/accounts';
import { importRoutes } from './routes/imports';
import { syncRoutes } from './routes/sync';

export type Deps = { db: Db; pocketsmith: PocketSmithClient; now: () => Date };

export function createApp(deps: Deps) {
  const app = new Hono();
  app.get('/health', (c) => c.json({ ok: true }));
  app.use('*', bearerAuth(deps.db));
  app.route('/', accountRoutes(deps));
  app.route('/', importRoutes(deps));
  app.route('/', syncRoutes(deps));
  return app;
}
