import { Hono } from 'hono';
import { bearerAuth } from './auth';
import type { Db } from './db/db';
import type { PocketSmithClient } from './pocketsmith';
import { makeRepo } from './db/repo';
import { accountRoutes } from './routes/accounts';
import { categoryRoutes } from './routes/categories';
import { eventRoutes } from './routes/events';
import { importRoutes } from './routes/imports';
import { limitRoutes } from './routes/limits';
import { ruleRoutes } from './routes/rules';
import { spendingRoutes } from './routes/spending';
import { syncRoutes } from './routes/sync';
import { transactionRoutes } from './routes/transactions';

export type Deps = { db: Db; pocketsmith: PocketSmithClient; now: () => Date };

export function createApp(deps: Deps) {
  const app = new Hono();
  app.get('/health', (c) => c.json({ ok: true }));
  app.use('*', bearerAuth(deps.db));
  app.route('/', accountRoutes(deps));
  app.route('/', importRoutes(deps));
  app.route('/', syncRoutes(deps));
  app.route('/', categoryRoutes(deps));
  app.route('/', transactionRoutes(deps));
  app.route('/', ruleRoutes(deps));
  app.route('/', spendingRoutes(deps));
  app.route('/', limitRoutes(deps));
  app.route('/', eventRoutes(deps));
  return app;
}
