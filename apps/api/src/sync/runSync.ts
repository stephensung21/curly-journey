import { mapAccount, mapTransaction } from '@curly/core';
import type { Deps } from '../app';
import type { Db } from '../db/db';
import { makeRepo, type HistoryState, type Repo } from '../db/repo';
import type { TransactionQuery } from '../pocketsmith';

export type SyncResult = {
  status: 'ok' | 'failed' | 'skipped';
  accounts: number;
  transactions: number;
  /** History is still being fetched; call again (or wait for the next cron) to continue. */
  more: boolean;
  error?: string;
};

const HOUR_MS = 60 * 60 * 1000;

/**
 * Workers Free allows 50 outbound requests per invocation, and every Neon query and PocketSmith page is one.
 * Stay under it with room to spare.
 */
export const MAX_CALLS = 45;
/** Kept back so a run can always record its result. */
const RESERVE = 2;
/** History is fetched newest first, one window at a time, until it reaches this far back. */
const WINDOW_DAYS = 90;
const HISTORY_DAYS = 400;
/** Cron runs every 15 minutes; a full sync is due this long after the last one. */
const DUE_AFTER_MS = 4 * HOUR_MS - 10 * 60 * 1000;

class BudgetExhausted extends Error {
  constructor() {
    super('call budget exhausted');
  }
}

const sydneyDate = (d: Date): string => d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/** True when the 15-minute cron should run a sync: never synced, history still loading, or the last one is ~4h old. */
export async function syncDue(db: Db, now: Date): Promise<boolean> {
  const last = await makeRepo(db).lastOkSync();
  return !last || last.more || now.getTime() - last.startedAt.getTime() >= DUE_AFTER_MS;
}

export async function runSync(deps: Deps, opts: { maxCalls?: number } = {}): Promise<SyncResult> {
  const limit = (opts.maxCalls ?? MAX_CALLS) - RESERVE;
  let used = 0;
  const db: Db = {
    query(text, params) {
      used++;
      return deps.db.query(text, params);
    },
  };
  const ps = deps.pocketsmith;
  const repo = makeRepo(db);
  const left = () => limit - used;

  let id: number | null;
  try {
    id = await repo.startSync(deps.now());
  } catch (e) {
    return { status: 'failed', accounts: 0, transactions: 0, more: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (id === null) return { status: 'skipped', accounts: 0, transactions: 0, more: false };

  let accounts = 0;
  let transactions = 0;

  /**
   * Fetches every page of a query. Returns false when the budget ran out first: allowed during history,
   * where the window is simply retried next run, but a hard failure for the incremental pass.
   */
  async function fetchAll(repo: Repo, psId: number, localId: number, query: TransactionQuery, mustFinish: boolean): Promise<boolean> {
    const seen = new Set<string>();
    let next: string | undefined;
    do {
      if (left() < 2) {
        if (mustFinish) throw new BudgetExhausted();
        return false;
      }
      used++;
      const page = await ps.transactionsPage(psId, query, next);
      if (page.items.length) transactions += await repo.upsertTransactions(localId, page.items.map(mapTransaction));
      if (page.next && seen.has(page.next)) throw new Error('PocketSmith pagination loop detected');
      if (page.next) seen.add(page.next);
      next = page.next ?? undefined;
    } while (next);
    return true;
  }

  try {
    const last = await repo.lastSuccessfulSync();
    const today = sydneyDate(deps.now());
    used++;
    const { id: userId } = await ps.me();
    used++;
    const psAccounts = await ps.transactionAccounts(userId);

    const states: (HistoryState & { psId: number })[] = [];
    for (const a of psAccounts) {
      if (left() < 1) throw new BudgetExhausted();
      states.push({ ...(await repo.upsertAccountState(mapAccount(a))), psId: a.id });
      accounts++;
    }

    // Changes since the last successful sync, for accounts whose history has started.
    if (last) {
      const updatedSince = new Date(last.startedAt.getTime() - HOUR_MS).toISOString();
      for (const s of states) {
        if (s.historyFrom !== null) await fetchAll(repo, s.psId, s.id, { updatedSince }, true);
      }
    }

    // History, newest window first, as far as the budget allows.
    let more = false;
    outer: for (const s of states) {
      while (!s.historyDone) {
        const endDate = s.historyFrom ? addDays(s.historyFrom, -1) : today;
        const startDate = addDays(endDate, -(WINDOW_DAYS - 1));
        if (!(await fetchAll(repo, s.psId, s.id, { startDate, endDate }, false)) || left() < 1) {
          more = true;
          break outer;
        }
        const done = startDate <= addDays(today, -HISTORY_DAYS);
        await repo.setHistory(s.id, startDate, done);
        s.historyFrom = startDate;
        s.historyDone = done;
      }
    }

    await repo.finishSync(id, { status: 'ok', accounts, transactions, more }, deps.now());
    return { status: 'ok', accounts, transactions, more };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    try {
      await repo.finishSync(id, { status: 'failed', error, accounts, transactions }, deps.now());
    } catch {
      // Nothing more to do; the stale running row expires via the lock window.
    }
    return { status: 'failed', accounts, transactions, more: false, error };
  }
}
