import { createApp, type Deps } from './app';
import { coinSpotClient } from './coinspot/client';
import { neonDb } from './db/db';
import { pocketSmithClient } from './pocketsmith/client';
import { runSync, syncDue } from './sync/runSync';

type Env = {
  DATABASE_URL: string;
  POCKETSMITH_KEY: string;
  COINSPOT_KEY?: string;
  COINSPOT_SECRET?: string;
  EXPO_ACCESS_TOKEN?: string;
};

function depsFor(env: Env): Deps {
  return {
    db: neonDb(env.DATABASE_URL),
    pocketsmith: pocketSmithClient(env.POCKETSMITH_KEY),
    now: () => new Date(),
    coinspot: env.COINSPOT_KEY && env.COINSPOT_SECRET ? coinSpotClient(env.COINSPOT_KEY, env.COINSPOT_SECRET) : undefined,
  };
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    return createApp(depsFor(env)).fetch(request);
  },
  scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): void {
    const deps = depsFor(env);
    ctx.waitUntil(
      (async () => {
        // Cron fires every 15 minutes so history can load quickly; a full sync only runs when due.
        if (!(await syncDue(deps.db, deps.now()))) return;
        const result = await runSync(deps);
        // Status only: the error text could echo connection details.
        if (result.status === 'failed') console.error('sync failed', result.status);
      })(),
    );
  },
};
