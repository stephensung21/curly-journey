import { createApp, type Deps } from './app';
import { neonDb } from './db/db';
import type { PocketSmithClient } from './pocketsmith';
import { runSync } from './sync/runSync';

type Env = { DATABASE_URL: string; POCKETSMITH_KEY: string };

// Real PocketSmith client arrives in Task 5.
function notImplemented(): PocketSmithClient {
  const fail = () => Promise.reject(new Error('PocketSmith client not implemented'));
  return { me: fail, transactionAccounts: fail, transactions: fail };
}

function depsFor(env: Env): Deps {
  return { db: neonDb(env.DATABASE_URL), pocketsmith: notImplemented(), now: () => new Date() };
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    return createApp(depsFor(env)).fetch(request);
  },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await runSync(depsFor(env));
  },
};
