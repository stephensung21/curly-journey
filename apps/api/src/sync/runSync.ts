import { mapAccount, mapTransaction, type PsTransaction } from '@curly/core';
import type { Deps } from '../app';
import type { Db } from '../db/db';
import { makeRepo, type HistoryState } from '../db/repo';
import { PocketSmithError } from '../pocketsmith';
import { PIPELINE_CALLS, runPipeline } from '../spending/pipeline';

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
 * Stay under it with room to spare. A run costs: 4 fixed (sync log start, me, accounts, one upsert of every account),
 * then reconciliation (2 per page of recent rows across all accounts, plus one delete that also saves the owner's
 * edits), then history with whatever is left (2 per page plus one query per window or resume cursor, plus one to
 * clear a rejected cursor), then the categorisation pipeline when at least
 * PIPELINE_CALLS are left (otherwise `more`), then the sync log finish from the reserve.
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

class StaleCursor extends Error {
  constructor() {
    super('saved history page rejected');
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
   * Fetches pages from `cursor` (or the first page) until the last one, upserting each page in one query. A page is
   * only fetched with at least 3 calls left (the page, its upsert, and the caller's follow-up query), so the caller
   * can always record what happened. Running out of budget is allowed during history, where the window resumes from
   * `next` on a later run, but a hard failure for reconciliation. A saved cursor PocketSmith rejects with a 4xx (it
   * may have expired) throws StaleCursor, so the caller can restart the window.
   */
  async function fetchAll(
    getPage: (pageUrl?: string) => Promise<{ items: PsTransaction[]; next: string | null }>,
    localAccount: (psAccountId: number) => number | undefined,
    opts: { mustFinish: boolean; cursor?: string | null },
  ): Promise<{ complete: boolean; ids: string[]; next: string | undefined; pages: number }> {
    const seen = new Set<string>();
    const ids: string[] = [];
    let next = opts.cursor ?? undefined;
    let pages = 0;
    do {
      if (left() < 3) {
        if (opts.mustFinish) throw new BudgetExhausted();
        return { complete: false, ids, next, pages };
      }
      used++;
      let page: { items: PsTransaction[]; next: string | null };
      try {
        page = await getPage(next);
      } catch (e) {
        if (pages === 0 && opts.cursor && e instanceof PocketSmithError && e.status >= 400 && e.status < 500) {
          throw new StaleCursor();
        }
        throw e;
      }
      pages++;
      const rows = [];
      for (const t of page.items) {
        const row = mapTransaction(t);
        ids.push(row.externalId);
        const accountId = localAccount(t.transaction_account.id);
        if (accountId === undefined) continue;
        rows.push({ accountId, row });
        if (since === null || row.date < since) since = row.date;
      }
      if (rows.length) transactions += await repo.upsertFeedTransactions(rows);
      if (page.next && seen.has(page.next)) throw new Error('PocketSmith pagination loop detected');
      if (page.next) seen.add(page.next);
      next = page.next ?? undefined;
    } while (next);
    return { complete: true, ids, next: undefined, pages };
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
    const localByPs = new Map(states.map((s) => [s.psId, s.id]));

    // Refetch the recent window across all accounts in one paginated pass, then drop feed rows PocketSmith no longer
    // returns there, so a pending row that posts under a new ID disappears. Only accounts whose history has started
    // are pruned; the others get today in their first history window below.
    const started = states.filter((s) => s.historyFrom !== null).map((s) => s.id);
    if (started.length) {
      const from = addDays(today, -RECONCILE_DAYS);
      const query = { startDate: from, endDate: today };
      const { ids } = await fetchAll((u) => ps.userTransactionsPage(userId, query, u), (a) => localByPs.get(a), { mustFinish: true });
      // The owner's edits on deleted rows are saved in the same query; the pipeline carries them to the replacements.
      const { skipped } = await repo.deleteMissingFeedRows(started, from, today, ids, deps.now());
      if (skipped) console.error('reconcile delete skipped', skipped);
    }

    // History, one window per account per pass, so every account gets its recent months before anyone's old ones.
    // Accounts least far back go first, and a window already under way before others at the same point, so a long
    // window resumed over several runs never starves the rest.
    const order = (a: HistoryState, b: HistoryState) =>
      (b.historyFrom ?? '9999-12-31').localeCompare(a.historyFrom ?? '9999-12-31') ||
      Number(b.historyCursor !== null) - Number(a.historyCursor !== null);
    let more = false;
    outer: for (
      let pending = states.filter((s) => !s.historyDone).sort(order);
      pending.length;
      pending = pending.filter((s) => !s.historyDone)
    ) {
      for (const s of pending) {
        const endDate = s.historyFrom ? addDays(s.historyFrom, -1) : today;
        const startDate = addDays(endDate, -(WINDOW_DAYS - 1));
        const query = { startDate, endDate };
        const fetchWindow = () =>
          fetchAll((u) => ps.transactionsPage(s.psId, query, u), () => s.id, { mustFinish: false, cursor: s.historyCursor });
        let res: Awaited<ReturnType<typeof fetchAll>>;
        try {
          res = await fetchWindow();
        } catch (e) {
          if (!(e instanceof StaleCursor)) throw e;
          // Otherwise every run would fail on the same page: restart the window instead.
          await repo.setHistoryCursor(s.id, null);
          s.historyCursor = null;
          res = await fetchWindow();
        }
        if (!res.complete) {
          if (res.pages && res.next) await repo.setHistoryCursor(s.id, res.next);
          more = true;
          break outer;
        }
        const done = startDate <= addDays(today, -HISTORY_DAYS);
        await repo.setHistory(s.id, startDate, done);
        s.historyFrom = startDate;
        s.historyDone = done;
        s.historyCursor = null;
      }
    }

    // Categorise and detect transfers with what is left, or leave that to the next run. Edits carried from deleted rows
    // wait in the database until the pipeline runs.
    if (left() >= PIPELINE_CALLS) {
      if ((await runPipeline(repo, { since, now: deps.now() })).more) more = true;
    } else {
      more = true;
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
