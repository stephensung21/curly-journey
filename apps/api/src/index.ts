import { createApp, type Deps } from './app';
import { neonDb } from './db/db';
import { pocketSmithClient } from './pocketsmith/client';
import { runSync } from './sync/runSync';

type Env = { DATABASE_URL: string; POCKETSMITH_KEY: string };

function depsFor(env: Env): Deps {
  return { db: neonDb(env.DATABASE_URL), pocketsmith: pocketSmithClient(env.POCKETSMITH_KEY), now: () => new Date() };
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    return createApp(depsFor(env)).fetch(request);
  },
  scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): void {
    ctx.waitUntil(runSync(depsFor(env)));
  },
};
