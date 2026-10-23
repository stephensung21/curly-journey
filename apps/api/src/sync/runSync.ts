import { mapAccount, mapTransaction } from '@curly/core';
import type { Deps } from '../app';
import type { Db } from '../db/db';
import { makeRepo, type Repo } from '../db/repo';
import type { TransactionQuery } from '../pocketsmith';

export type SyncResult = {
  status: 'ok' | 'failed' | 'skipped';
  accounts: number;
  transactions: number;
  /** History is still being fetched; call again (or wait for the next cron) to continue. */
  more: boolean;
  /** Earliest date of any row upserted this run, or null if none: where the categorisation pipeline should start. */
  since: string | null;
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
/** Recent days refetched every run, so edits land and pending rows that posted under a new ID are removed. */
const RECONCILE_DAYS = 14;
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
    return { status: 'failed', accounts: 0, transactions: 0, more: false, since: null, error: e instanceof Error ? e.message : String(e) };
  }
  if (id === null) return { status: 'skipped', accounts: 0, transactions: 0, more: false, since: null };

  let accounts = 0;
  let transactions = 0;
  let since: string | null = null;

  /**
   * Fetches every page of a query, returning whether it finished and the external IDs it saw. Running out of budget
   * is allowed during history, where the window is simply retried next run, but a hard failure for reconciliation.
   */
  async function fetchAll(
    repo: Repo, psId: number, localId: number, query: TransactionQuery, mustFinish: boolean,
  ): Promise<{ complete: boolean; ids: string[] }> {
    const seen = new Set<string>();
    const ids: string[] = [];
    let next: string | undefined;
    do {
      if (left() < 2) {
        if (mustFinish) throw new BudgetExhausted();
        return { complete: false, ids };
      }
      used++;
      const page = await ps.transactionsPage(psId, query, next);
      if (page.items.length) {
        const rows = page.items.map(mapTransaction);
        transactions += await repo.upsertTransactions(localId, rows);
        for (const r of rows) {
          ids.push(r.externalId);
          if (since === null || r.date < since) since = r.date;
        }
      }
      if (page.next && seen.has(page.next)) throw new Error('PocketSmith pagination loop detected');
      if (page.next) seen.add(page.next);
      next = page.next ?? undefined;
    } while (next);
    return { complete: true, ids };
  }

  try {
    const today = sydneyDate(deps.now());
    used++;
    const { id: userId } = await ps.me();
    used++;
    const psAccounts = await ps.transactionAccounts(userId);

    if (left() < 1) throw new BudgetExhausted();
    const states = (await repo.upsertAccountStates(psAccounts.map(mapAccount))).map((s, i) => ({ ...s, psId: psAccounts[i]!.id }));
    accounts = states.length;

    // Refetch the recent window of every account whose history has started, and drop feed rows PocketSmith no longer
    // returns there: a pending row that posts under a new ID disappears. Accounts without history get today below.
    const reconcileFrom = addDays(today, -RECONCILE_DAYS);
    for (const s of states) {
      if (s.historyFrom === null) continue;
      const { ids } = await fetchAll(repo, s.psId, s.id, { startDate: reconcileFrom, endDate: today }, true);
      if (left() < 1) throw new BudgetExhausted();
      await repo.deleteMissingFeedRows(s.id, reconcileFrom, ids);
    }

    // History, one window per account per pass, so every account gets its recent months before anyone's old ones.
    let more = false;
    outer: for (let pending = states.filter((s) => !s.historyDone); pending.length; pending = pending.filter((s) => !s.historyDone)) {
      for (const s of pending) {
        const endDate = s.historyFrom ? addDays(s.historyFrom, -1) : today;
        const startDate = addDays(endDate, -(WINDOW_DAYS - 1));
        if (!(await fetchAll(repo, s.psId, s.id, { startDate, endDate }, false)).complete || left() < 1) {
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
    return { status: 'ok', accounts, transactions, more, since };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    try {
      await repo.finishSync(id, { status: 'failed', error, accounts, transactions }, deps.now());
    } catch {
      // Nothing more to do; the stale running row expires via the lock window.
    }
    return { status: 'failed', accounts, transactions, more: false, since, error };
  }
}
