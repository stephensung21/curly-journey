import { mapAccount, mapTransaction } from '@curly/core';
import type { Deps } from '../app';
import { makeRepo } from '../db/repo';

export type SyncResult = { status: 'ok' | 'failed' | 'skipped'; accounts: number; transactions: number; error?: string };

const HOUR_MS = 60 * 60 * 1000;

export async function runSync(deps: Deps): Promise<SyncResult> {
  const repo = makeRepo(deps.db);
  let id: number | null;
  try {
    id = await repo.startSync(deps.now());
  } catch (e) {
    return { status: 'failed', accounts: 0, transactions: 0, error: e instanceof Error ? e.message : String(e) };
  }
  if (id === null) return { status: 'skipped', accounts: 0, transactions: 0 };

  let accounts = 0;
  let transactions = 0;
  try {
    const last = await repo.lastSuccessfulSync();
    const updatedSince = last ? new Date(last.startedAt.getTime() - HOUR_MS).toISOString() : undefined;
    const { id: userId } = await deps.pocketsmith.me();
    const psAccounts = await deps.pocketsmith.transactionAccounts(userId);
    for (const a of psAccounts) {
      const localId = await repo.upsertAccount(mapAccount(a));
      accounts++;
      const txs = await deps.pocketsmith.transactions(a.id, { updatedSince });
      transactions += await repo.upsertTransactions(localId, txs.map(mapTransaction));
    }
    await repo.finishSync(id, { status: 'ok', accounts, transactions }, deps.now());
    return { status: 'ok', accounts, transactions };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    try {
      await repo.finishSync(id, { status: 'failed', error, accounts, transactions }, deps.now());
    } catch {
      // Nothing more to do; the stale running row expires via the lock window.
    }
    return { status: 'failed', accounts, transactions, error };
  }
}
