import {
  cleanMerchant,
  defaultCounts,
  monthPeriod,
  type AccountKind,
  type AccountRow,
  type CategorySource,
  type CategoriseInput,
  type Cents,
  type Flow,
  type FlowTxn,
  type ImportedRow,
  type ProjectionsRole,
  type Rule,
  type SpendLine,
  type TransactionRow,
} from '@curly/core';
import type { Db } from './db';

export type AccountDto = {
  id: number;
  institution: string;
  name: string;
  displayName: string | null;
  source: 'pocketsmith' | 'manual' | 'coinspot' | 'commsec';
  kind: AccountKind;
  balanceCents: Cents;
  balanceDate: string | null;
  countsSpending: boolean;
  countsNetWorth: boolean;
  projections: ProjectionsRole;
  isOffset: boolean;
  icon: string | null;
  sortOrder: number | null;
  /** Yearly growth in basis points shown on a manual account's value; null for none. */
  growthBps: number | null;
  /** Left off the Accounts page; nothing else changes. */
  hidden: boolean;
  /** ISO 8601 UTC: when a CoinSpot account last synced; null for other sources. */
  syncedAt: string | null;
};

export type TransactionDto = {
  id: number;
  accountId: number;
  date: string;
  amountCents: Cents;
  description: string;
  merchant: string;
  status: 'posted' | 'pending';
  source: 'pocketsmith' | 'csv';
  categoryId: number | null;
  categorySource: CategorySource | null;
  flow: Flow;
  flowSource: 'auto' | 'user' | 'rule';
  note: string | null;
  memo: string | null;
  /** ISO 8601 UTC: when PocketSmith first received the row. */
  feedCreatedAt: string | null;
  splits: { categoryId: number; amountCents: Cents }[];
};

export type TransactionFilter = {
  from: string;
  to: string;
  accountIds?: number[];
  /** A category id, or 'none' for rows without one. */
  categoryId?: number | 'none';
};

export type TransactionPatch = {
  categoryId?: number | null;
  flow?: Flow;
  note?: string | null;
};

export type NewCategory = Pick<CategoryDto, 'name' | 'emoji' | 'color' | 'kind'>;

export type RuleMatch = { matchText: string; accountId: number | null; amountCents: number | null };
export type NewRule = RuleMatch & {
  origin: 'user' | 'learned';
  categoryId: number | null;
  flow: Flow | null;
};

export type CategoryDto = {
  id: number;
  name: string;
  emoji: string;
  color: string;
  kind: 'spending' | 'income';
  sort: number;
};

export type UncategorisedRow = CategoriseInput & { id: number; date: string };

export type CategorisationUpdate = {
  id: number;
  /** The merchant categorised by; stored, since rows synced before merchants existed have none. */
  merchant: string;
  categoryId: number | null;
  source: string | null;
  flow: Flow | null;
  ruleId: number | null;
};

export type AccountSettingsPatch = Partial<
  Pick<AccountDto, 'countsSpending' | 'countsNetWorth' | 'projections' | 'isOffset' | 'displayName' | 'icon' | 'growthBps' | 'hidden'>
>;

export type HistoryState = {
  id: number;
  historyFrom: string | null;
  historyDone: boolean;
  /** Next page of the history window in progress, when the last run ran out of budget part-way through it. */
  historyCursor: string | null;
};

export type InboxPage = { items: (TransactionDto & { psCategory: string | null })[]; total: number };

export interface Repo {
  upsertAccount(row: AccountRow): Promise<number>;
  /** Upsert, returning how far back this account's history has been fetched. */
  upsertAccountState(row: AccountRow): Promise<HistoryState>;
  /** Upserts every account in one query; results are in input order. */
  upsertAccountStates(rows: AccountRow[]): Promise<HistoryState[]>;
  /** Records a completed history window and clears the resume cursor. */
  setHistory(id: number, from: string, done: boolean): Promise<void>;
  /** Saves (or with null clears) the next page of the history window in progress. */
  setHistoryCursor(id: number, cursor: string | null): Promise<void>;
  upsertTransactions(accountId: number, rows: TransactionRow[]): Promise<number>;
  /** Like upsertTransactions, for rows of several accounts at once (one query per 100 rows). */
  upsertFeedTransactions(rows: { accountId: number; row: TransactionRow }[]): Promise<number>;
  insertCsvRows(accountId: number, rows: { row: ImportedRow; fingerprint: string }[]): Promise<number>;
  /**
   * Deletes these accounts' feed rows dated `from` to `to` whose external ID is not in `keep`, and saves the owner's
   * edits on them (a user category or flow, or a note) as carried edits created at `now`, in one query. CSV rows are
   * never touched. A short or empty fetch must not wipe the window, so nothing is deleted when `keep` is empty and the
   * window has rows, or when more than 3 rows and over 30% of the window would go; `skipped` is then how many would
   * have, otherwise 0.
   */
  deleteMissingFeedRows(
    accountIds: number[],
    from: string,
    to: string,
    keep: string[],
    now: Date,
  ): Promise<{ deleted: number; carried: number; skipped: number }>;
  listAccounts(): Promise<AccountDto[]>;
  /** Sets sort_order to each id's 1-based position; false (nothing written) if an id is unknown or repeated. */
  setAccountOrder(ids: number[]): Promise<boolean>;
  getAccount(id: number): Promise<AccountDto | null>;
  existingCsvKeys(accountId: number, keys: string[]): Promise<Set<string>>;
  updateAccountSettings(id: number, patch: AccountSettingsPatch): Promise<AccountDto | null>;
  listTransactions(accountId: number, month: string): Promise<TransactionDto[]>;
  /** Rows dated `from` to `to` inclusive, newest first. */
  queryTransactions(filter: TransactionFilter): Promise<TransactionDto[]>;
  getTransaction(id: number): Promise<TransactionDto | null>;
  /** Applies the owner's edits (category and flow become 'user' sourced); null when the row does not exist. */
  patchTransaction(id: number, patch: TransactionPatch): Promise<TransactionDto | null>;
  /**
   * One line per split part, or per row without splits, dated `from` to `to`. With `accountIds`, exactly those
   * accounts; otherwise every account that counts towards spending.
   */
  spendLines(f: { from: string; to: string; accountIds?: number[] }): Promise<SpendLine[]>;
  /** Newest `limit` uncategorised outflows with flow 'normal' on spending accounts, and how many there are in all. */
  inbox(limit: number): Promise<InboxPage>;
  /** merchant -> category of the latest row the owner categorised, for just these merchants. */
  userCategoryByMerchant(merchants: string[]): Promise<Map<string, number>>;
  /** Spending categories with the most rows dated `since` or later, most used first. */
  topCategoriesSince(since: string, limit: number): Promise<number[]>;
  /** Rows created at or after `since` that the pipeline categorised, and how many it categorised by itself. */
  categorisationSince(since: Date): Promise<{ total: number; auto: number }>;
  /** Replaces the row's splits (none clears them); null when the row does not exist. */
  setSplits(id: number, splits: { categoryId: number; amountCents: Cents }[]): Promise<TransactionDto | null>;
  /** Null when the name is taken. */
  createCategory(c: NewCategory): Promise<CategoryDto | null>;
  /** Every rule with how many transactions it matches. */
  listRulesWithMatches(): Promise<(Rule & { matches: number })[]>;
  /** Rows the rule would change: not user-categorised, and not already in `categoryId`. */
  /** Rows a new rule would change, and separately the hand-sorted rows it would change only if asked. */
  previewRule(m: RuleMatch, categoryId: number | null): Promise<{ matches: number; handSorted: number }>;
  /**
   * Creates the rule; with `applyToPast`, also applies it to matching rows the owner has not set, and with
   * `includeHandSorted` to rows the owner categorised by hand too (they stay hand-sorted).
   */
  createRule(r: NewRule, applyToPast: boolean, includeHandSorted?: boolean): Promise<{ rule: Rule; updated: number }>;
  deleteRule(id: number): Promise<boolean>;
  transactionsNear(accountId: number, from: string, to: string): Promise<ImportedRow[]>;
  startSync(now: Date): Promise<number | null>;
  finishSync(
    id: number,
    result: { status: 'ok' | 'failed'; error?: string; accounts?: number; transactions?: number; more?: boolean },
    now: Date,
  ): Promise<void>;
  lastSuccessfulSync(): Promise<{ startedAt: Date; finishedAt: Date } | null>;
  /** Start of the last successful sync, and whether it left history still to fetch. */
  lastOkSync(): Promise<{ startedAt: Date; more: boolean } | null>;
  lastSyncStatus(): Promise<'ok' | 'failed' | 'running' | null>;
  /** Per PocketSmith institution, the newest time PocketSmith received a transaction from the bank; newest first. */
  /** Per bank: the newest transaction PocketSmith received (`at`), and when it last updated the accounts (`checkedAt`). */
  bankDataTimes(): Promise<{ institution: string; at: string; checkedAt: string | null }[]>;
  listCategories(): Promise<CategoryDto[]>;
  /** Every name each category answers to, for the built-in name mappings. */
  categoryNames(): Promise<{ id: number; name: string; aliases: string[] }[]>;
  /** Renames or restyles; a rename keeps the old name as an alias. Null if unknown, 'exists' if the name is taken. */
  updateCategory(id: number, patch: Partial<Pick<CategoryDto, 'name' | 'emoji' | 'color'>>): Promise<CategoryDto | null | 'exists'>;
  /**
   * Moves everything from `from` into `into` (transactions, splits, rules, carried edits, the limit unless `into`
   * has one, and its names as aliases), then deletes `from`. Steps are ordered so a retry after a failure finishes
   * the job. False if either id is unknown.
   */
  mergeCategory(from: number, into: number): Promise<boolean>;
  /**
   * Deletes a category. Its transactions (split ones whole) become uncategorised and go back through the pipeline;
   * its rules and limit go, except a rule that also sets a flow keeps the flow. False if unknown.
   */
  deleteCategory(id: number): Promise<boolean>;
  /** Renumbers sort 1..n with `ids` first and the rest after in their old order; false (nothing written) if an id is unknown or repeated. */
  setCategoryOrder(ids: number[]): Promise<boolean>;
  listRules(): Promise<Rule[]>;
  /** merchant -> category of the latest row the owner categorised. */
  pastByMerchant(): Promise<Map<string, number>>;
  /**
   * Up to `limit` rows with categorised = false, oldest first: CSV rows, and feed rows of accounts whose history is
   * fully loaded (until then a refetch may still fill in their PocketSmith category).
   */
  uncategorisedForPipeline(limit: number): Promise<UncategorisedRow[]>;
  /**
   * In one query: drops carried edits older than 7 days at `now`, and copies each other one onto one row that replaced
   * the deleted row (same account and amount, dated within 3 days, received by PocketSmith no earlier than a day before
   * the edit was saved, its category and flow not set by the owner; closest date, then lowest id; one edit per row),
   * deleting the edits applied. The rest wait for a later run. Returns how many were applied and dropped.
   */
  applyCarriedEdits(now: Date): Promise<{ applied: number; expired: number }>;
  /** Writes pipeline results and marks the rows categorised; user-set categories and flows are kept. */
  applyCategorisation(rows: CategorisationUpdate[]): Promise<void>;
  /** Every account's rows dated `from` or later, with only what detectFlows needs. */
  flowTxnsSince(from: string): Promise<FlowTxn[]>;
  /** Writes flow decisions to rows whose flow_source is 'auto'; returns how many rows changed. */
  applyFlows(decisions: Map<number, { flow: Flow; pairId: number | null }>): Promise<number>;
}

const SYNC_LOCK_MS = 10 * 60 * 1000;
const CHUNK = 100;
/** Rows per bulk pipeline update: a few arrays per query, so a normal run needs one. */
const BULK_CHUNK = 1000;

// Dates are cast to text in SQL and bigints to numbers here, so PGlite and Neon return identical shapes.
export const ACCOUNT_COLS = `id, source, institution, name, display_name, kind, balance_cents::text as balance_cents,
  to_char(balance_date, 'YYYY-MM-DD') as balance_date, counts_spending, counts_net_worth, projections, is_offset, icon, sort_order, growth_bps, hidden,
  to_char(synced_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as synced_at`;

export type AccountSql = {
  id: number;
  source: 'pocketsmith' | 'manual' | 'coinspot' | 'commsec';
  institution: string;
  name: string;
  display_name: string | null;
  kind: AccountKind;
  balance_cents: string | number;
  balance_date: string | null;
  counts_spending: boolean;
  counts_net_worth: boolean;
  projections: ProjectionsRole;
  is_offset: boolean;
  icon: string | null;
  sort_order: number | null;
  growth_bps: number | null;
  hidden: boolean;
  synced_at: string | null;
};

export const toAccountDto = (r: AccountSql): AccountDto => ({
  id: Number(r.id),
  source: r.source,
  institution: r.institution,
  name: r.name,
  displayName: r.display_name,
  kind: r.kind,
  balanceCents: Number(r.balance_cents),
  balanceDate: r.balance_date,
  countsSpending: r.counts_spending,
  countsNetWorth: r.counts_net_worth,
  projections: r.projections,
  isOffset: r.is_offset,
  icon: r.icon,
  sortOrder: r.sort_order === null ? null : Number(r.sort_order),
  growthBps: r.growth_bps === null ? null : Number(r.growth_bps),
  hidden: r.hidden,
  syncedAt: r.synced_at,
});

type TransactionSql = {
  id: string | number;
  account_id: number;
  date: string;
  amount_cents: string | number;
  description_raw: string;
  merchant: string;
  status: string;
  source: 'pocketsmith' | 'csv';
  category_id: number | null;
  category_source: CategorySource | null;
  flow: Flow;
  flow_source: 'auto' | 'user' | 'rule';
  note: string | null;
  memo: string | null;
  feed_created_at: string | null;
};

const TRANSACTION_COLS = `t.id, t.account_id, to_char(t.date, 'YYYY-MM-DD') as date, t.amount_cents::text as amount_cents,
  t.description_raw, t.merchant, t.status, t.source, t.category_id, t.category_source, t.flow, t.flow_source, t.note,
  t.memo, to_char(t.feed_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as feed_created_at`;

/** SQL for "transaction `t` has no split parts"; a split row's categories are its parts'. */
const NO_SPLITS = 'not exists (select 1 from transaction_split where transaction_id = t.id)';

/** SQL for "transaction `t` matches the rule whose text, account and amount are $1, $2, $3"; mirrors core ruleMatches. */
const RULE_MATCH_SQL = `(strpos(upper(t.description_raw), upper($1)) > 0 or strpos(upper(t.merchant), upper($1)) > 0)
  and ($2::int is null or t.account_id = $2::int) and ($3::bigint is null or t.amount_cents = $3::bigint)`;

type RuleSql = {
  id: number;
  origin: 'user' | 'learned';
  match_text: string;
  account_id: number | null;
  amount_cents: string | null;
  category_id: number | null;
  flow: Flow | null;
  created_at: string;
};

const RULE_COLS = `id, origin, match_text, account_id, amount_cents::text as amount_cents, category_id, flow,
  to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at`;

const toRule = (r: RuleSql): Rule => ({
  id: Number(r.id),
  origin: r.origin,
  matchText: r.match_text,
  accountId: r.account_id === null ? null : Number(r.account_id),
  amountCents: r.amount_cents === null ? null : Number(r.amount_cents),
  categoryId: r.category_id === null ? null : Number(r.category_id),
  flow: r.flow,
  createdAt: r.created_at,
});

const asDate = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));

/** Maps rows to DTOs, loading all their splits in one query. */
async function toTransactionDtos(db: Db, rows: TransactionSql[]): Promise<TransactionDto[]> {
  if (!rows.length) return [];
  const splits = await db.query<{ transaction_id: string | number; category_id: number; amount_cents: string | number }>(
    `select transaction_id, category_id, amount_cents::text as amount_cents from transaction_split
     where transaction_id = any($1::bigint[]) order by id`,
    [rows.map((r) => Number(r.id))],
  );
  const by = new Map<number, TransactionDto['splits']>();
  for (const sp of splits) {
    const list = by.get(Number(sp.transaction_id)) ?? [];
    list.push({ categoryId: Number(sp.category_id), amountCents: Number(sp.amount_cents) });
    by.set(Number(sp.transaction_id), list);
  }
  return rows.map((r) => ({
    id: Number(r.id),
    accountId: Number(r.account_id),
    date: r.date,
    amountCents: Number(r.amount_cents),
    description: r.description_raw,
    merchant: r.merchant,
    status: r.status === 'pending' ? 'pending' : 'posted',
    source: r.source,
    categoryId: r.category_id === null ? null : Number(r.category_id),
    categorySource: r.category_source,
    flow: r.flow,
    flowSource: r.flow_source,
    note: r.note,
    memo: r.memo,
    feedCreatedAt: r.feed_created_at,
    splits: by.get(Number(r.id)) ?? [],
  }));
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function makeRepo(db: Db): Repo {
  return {
    async upsertAccount(row) {
      return (await this.upsertAccountState(row)).id;
    },

    async setHistory(id, from, done) {
      await db.query(
        'update account set history_from = $2::date, history_done = $3, history_cursor = null where id = $1',
        [id, from, done],
      );
    },

    async setHistoryCursor(id, cursor) {
      await db.query('update account set history_cursor = $2 where id = $1', [id, cursor]);
    },

    async upsertAccountState(row) {
      return (await this.upsertAccountStates([row]))[0]!;
    },

    async upsertAccountStates(rows) {
      if (!rows.length) return [];
      // Postgres rejects a conflict target hit twice in one statement, so send each account once.
      const unique = [...new Map(rows.map((r) => [`${r.source}|${r.externalId}`, r])).values()];
      const params: unknown[] = [];
      const values = unique.map((row) => {
        const counts = defaultCounts(row.kind);
        const i = params.length;
        params.push(
          row.source, row.externalId, row.institution, row.name, row.kind, row.balanceCents, row.balanceDate,
          counts.countsSpending, counts.countsNetWorth, counts.projections, row.feedUpdatedAt ?? null,
        );
        return `(${Array.from({ length: 11 }, (_, k) => `$${i + k + 1}`).join(', ')}::timestamptz)`;
      });
      const res = await db.query<{
        id: number;
        source: string;
        external_id: string;
        history_from: string | null;
        history_done: boolean;
        history_cursor: string | null;
      }>(
        `insert into account (source, external_id, institution, name, kind, balance_cents, balance_date,
           counts_spending, counts_net_worth, projections, feed_updated_at)
         values ${values.join(', ')}
         on conflict (source, external_id) do update set
           institution = excluded.institution, name = excluded.name, kind = excluded.kind,
           balance_cents = excluded.balance_cents, balance_date = excluded.balance_date,
           feed_updated_at = coalesce(excluded.feed_updated_at, account.feed_updated_at)
         returning id, source, external_id, to_char(history_from, 'YYYY-MM-DD') as history_from, history_done,
           history_cursor`,
        params,
      );
      // RETURNING order is not guaranteed, so match rows back by key.
      const byKey = new Map(res.map((r) => [`${r.source}|${r.external_id}`, r]));
      return rows.map((row) => {
        const r = byKey.get(`${row.source}|${row.externalId}`)!;
        return { id: Number(r.id), historyFrom: r.history_from, historyDone: r.history_done, historyCursor: r.history_cursor };
      });
    },

    async upsertTransactions(accountId, rows) {
      return this.upsertFeedTransactions(rows.map((row) => ({ accountId, row })));
    },

    async upsertFeedTransactions(items) {
      // Last write wins within a batch; Postgres rejects a conflict target hit twice in one statement.
      const byKey = new Map(items.map((it) => [`${it.row.source}|${it.row.externalId}`, it]));
      let affected = 0;
      for (const part of chunks([...byKey.values()], CHUNK)) {
        const params: unknown[] = [];
        const values = part.map(({ accountId, row: r }) => {
          const i = params.length;
          params.push(
            accountId, r.source, r.externalId, r.date, r.amountCents, r.descriptionRaw, r.payee, r.status,
            r.merchant, r.psCategory, r.memo, r.feedCreatedAt,
          );
          return `(${Array.from({ length: 12 }, (_, k) => `$${i + k + 1}`).join(', ')})`;
        });
        // Category and flow columns belong to the pipeline and the owner; sync never writes them.
        const res = await db.query(
          `insert into transaction (account_id, source, external_id, date, amount_cents, description_raw, payee, status,
             merchant, ps_category, memo, feed_created_at)
           values ${values.join(', ')}
           on conflict (source, external_id) do update set
             date = excluded.date, amount_cents = excluded.amount_cents,
             payee = excluded.payee, status = excluded.status,
             merchant = excluded.merchant, ps_category = excluded.ps_category, memo = excluded.memo,
             feed_created_at = coalesce(transaction.feed_created_at, excluded.feed_created_at)
           returning id`,
          params,
        );
        affected += res.length;
      }
      return affected;
    },

    async insertCsvRows(accountId, rows) {
      let inserted = 0;
      for (const part of chunks(rows, CHUNK)) {
        const params: unknown[] = [];
        const values = part.map(({ row, fingerprint }) => {
          const i = params.length;
          params.push(accountId, fingerprint, row.date, row.amountCents, row.description, cleanMerchant(row.description));
          return `($${i + 1}, 'csv', $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6})`;
        });
        const res = await db.query(
          `insert into transaction (account_id, source, external_id, date, amount_cents, description_raw, merchant)
           values ${values.join(', ')}
           on conflict (source, external_id) do nothing
           returning id`,
          params,
        );
        inserted += res.length;
      }
      return inserted;
    },

    async deleteMissingFeedRows(accountIds, from, to, keep, now) {
      if (!accountIds.length) return { deleted: 0, carried: 0, skipped: 0 };
      const rows = await db.query<{ deleted: string | number; carried: string | number; skipped: string | number }>(
        `with w as (
           select t.id, t.external_id <> all($4::text[]) as missing,
             -- A pending row the feed dropped whose posted copy is here: always safe to remove, even past the guard.
             (t.status = 'pending' and t.external_id <> all($4::text[]) and exists (
               select 1 from transaction p
               where p.account_id = t.account_id and p.status = 'posted' and p.amount_cents = t.amount_cents
                 and abs(p.date - t.date) <= 5 and p.external_id = any($4::text[]))) as twin
           from transaction t
           where t.account_id = any($1::int[]) and t.source = 'pocketsmith' and t.date >= $2::date and t.date <= $3::date
         ), s as (
           select count(*) as total, count(*) filter (where missing) as missing, count(*) filter (where twin) as twins from w
         ), ok as (
           select s.missing, s.twins,
             not ((cardinality($4::text[]) = 0 and s.total > 0) or (s.missing > 3 and s.missing * 10 > s.total * 3)) as go
           from s
         ), d as (
           delete from transaction t using w, ok
           where t.id = w.id and w.missing and (ok.go or w.twin)
           returning t.account_id, t.amount_cents, t.date, t.category_id, t.category_source, t.flow, t.flow_source, t.note
         ), c as (
           insert into carried_edit (account_id, amount_cents, date, category_id, category_source, flow, flow_source, note,
             created_at)
           select account_id, amount_cents, date, category_id, category_source, flow, flow_source, note, $5::timestamptz
           from d where category_source = 'user' or flow_source = 'user' or note is not null
           returning id
         )
         select (select count(*) from d) as deleted, (select count(*) from c) as carried,
           (select case when go then 0 else missing - twins end from ok) as skipped`,
        [accountIds, from, to, keep, now.toISOString()],
      );
      const r = rows[0]!;
      return { deleted: Number(r.deleted), carried: Number(r.carried), skipped: Number(r.skipped) };
    },

    async listAccounts() {
      const rows = await db.query<AccountSql>(`select ${ACCOUNT_COLS} from account order by sort_order nulls last, id`);
      return rows.map(toAccountDto);
    },

    async setAccountOrder(ids) {
      if (new Set(ids).size !== ids.length) return false;
      const found = await db.query<{ n: string | number }>('select count(*) as n from account where id = any($1::int[])', [ids]);
      if (Number(found[0]!.n) !== ids.length) return false;
      await db.query(
        'update account a set sort_order = o.ord from unnest($1::int[]) with ordinality as o(id, ord) where a.id = o.id',
        [ids],
      );
      return true;
    },

    async getAccount(id) {
      const rows = await db.query<AccountSql>(`select ${ACCOUNT_COLS} from account where id = $1`, [id]);
      return rows[0] ? toAccountDto(rows[0]) : null;
    },

    async existingCsvKeys(accountId, keys) {
      if (!keys.length) return new Set();
      const found = new Set<string>();
      for (const part of chunks(keys, CHUNK)) {
        const rows = await db.query<{ external_id: string }>(
          `select external_id from transaction where account_id = $1 and source = 'csv' and external_id = any($2::text[])`,
          [accountId, part],
        );
        for (const r of rows) found.add(r.external_id);
      }
      return found;
    },

    async updateAccountSettings(id, patch) {
      const cols: Record<string, string> = {
        countsSpending: 'counts_spending',
        countsNetWorth: 'counts_net_worth',
        projections: 'projections',
        isOffset: 'is_offset',
        displayName: 'display_name',
        icon: 'icon',
        growthBps: 'growth_bps',
        hidden: 'hidden',
      };
      const sets: string[] = [];
      const params: unknown[] = [id];
      for (const [key, col] of Object.entries(cols)) {
        const v = (patch as Record<string, unknown>)[key];
        if (v === undefined) continue;
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      }
      const sql = sets.length
        ? `update account set ${sets.join(', ')} where id = $1 returning ${ACCOUNT_COLS}`
        : `select ${ACCOUNT_COLS} from account where id = $1`;
      const rows = await db.query<AccountSql>(sql, params);
      return rows[0] ? toAccountDto(rows[0]) : null;
    },

    async listTransactions(accountId, month) {
      // `date` holds Sydney local dates, so compare local calendar strings, never UTC instants.
      const { from, to } = monthPeriod(month);
      return this.queryTransactions({ from, to, accountIds: [accountId] });
    },

    async queryTransactions(f) {
      const params: unknown[] = [f.from, f.to];
      // Scoped like spendLines, so a category's rows add up to its Spending bar.
      const where = ['t.date >= $1::date', 't.date <= $2::date'];
      if (f.accountIds) {
        params.push(f.accountIds);
        where.push(`t.account_id = any($${params.length}::int[])`);
      } else {
        where.push('a.counts_spending');
      }
      if (f.categoryId === 'none') where.push(`t.category_id is null and ${NO_SPLITS}`);
      else if (f.categoryId !== undefined) {
        params.push(f.categoryId);
        const n = `$${params.length}::int`;
        where.push(
          `(exists (select 1 from transaction_split s where s.transaction_id = t.id and s.category_id = ${n})
            or (${NO_SPLITS} and t.category_id = ${n}))`,
        );
      }
      const rows = await db.query<TransactionSql>(
        `select ${TRANSACTION_COLS} from transaction t join account a on a.id = t.account_id
         where ${where.join(' and ')} order by t.date desc, t.id desc`,
        params,
      );
      return toTransactionDtos(db, rows);
    },

    async spendLines(f) {
      const params: unknown[] = [f.from, f.to];
      let scope = 'a.counts_spending';
      if (f.accountIds) {
        params.push(f.accountIds);
        scope = 't.account_id = any($3::int[])';
      }
      const rows = await db.query<{
        id: string | number;
        account_id: number;
        institution: string;
        date: string;
        amount_cents: string | number;
        category_id: number | null;
        kind: 'spending' | 'income' | null;
        flow: Flow;
        card_payment: boolean;
      }>(
        `select t.id, t.account_id, a.institution, to_char(t.date, 'YYYY-MM-DD') as date,
           coalesce(sp.amount_cents, t.amount_cents)::text as amount_cents,
           c.id as category_id, c.kind, t.flow,
           (t.flow = 'transfer' and t.amount_cents < 0 and a.kind <> 'credit_card' and (
              t.description_raw ~* '(AMEX|AMERICAN EXPRESS)'
              or exists (select 1 from transaction p join account pa on pa.id = p.account_id
                         where p.id = t.pair_id and pa.kind = 'credit_card'))) as card_payment
         from transaction t
         join account a on a.id = t.account_id
         left join transaction_split sp on sp.transaction_id = t.id
         left join category c on c.id = coalesce(sp.category_id, t.category_id)
         where t.date >= $1::date and t.date <= $2::date and ${scope}`,
        params,
      );
      return rows.map((r) => ({
        txnId: Number(r.id),
        accountId: Number(r.account_id),
        institution: r.institution,
        date: r.date,
        amountCents: Number(r.amount_cents),
        categoryId: r.category_id === null ? null : Number(r.category_id),
        categoryKind: r.kind,
        flow: r.flow,
        cardPayment: r.card_payment,
      }));
    },

    async inbox(limit) {
      const rows = await db.query<TransactionSql & { total: string | number; ps_category: string | null }>(
        `select ${TRANSACTION_COLS}, t.ps_category, count(*) over () as total
         from transaction t join account a on a.id = t.account_id
         where t.category_id is null and ${NO_SPLITS} and t.flow = 'normal' and t.amount_cents < 0 and a.counts_spending
         order by t.date desc, t.id desc
         limit $1`,
        [limit],
      );
      const dtos = await toTransactionDtos(db, rows);
      return { items: dtos.map((d, i) => ({ ...d, psCategory: rows[i]!.ps_category })), total: rows[0] ? Number(rows[0].total) : 0 };
    },

    async userCategoryByMerchant(merchants) {
      if (!merchants.length) return new Map();
      const rows = await db.query<{ merchant: string; category_id: number }>(
        `select distinct on (merchant) merchant, category_id from transaction
         where category_source = 'user' and category_id is not null and merchant = any($1::text[])
         order by merchant, date desc, id desc`,
        [merchants],
      );
      return new Map(rows.map((r) => [r.merchant, Number(r.category_id)]));
    },

    async topCategoriesSince(since, limit) {
      const rows = await db.query<{ category_id: number }>(
        `select t.category_id from transaction t join category c on c.id = t.category_id
         where c.kind = 'spending' and t.date >= $1::date
         group by t.category_id order by count(*) desc, t.category_id limit $2`,
        [since, limit],
      );
      return rows.map((r) => Number(r.category_id));
    },

    async categorisationSince(since) {
      const rows = await db.query<{ total: string | number; auto: string | number }>(
        `select count(*) as total, count(initial_source) as auto from transaction
         where categorised and created_at >= $1::timestamptz`,
        [since.toISOString()],
      );
      return { total: Number(rows[0]!.total), auto: Number(rows[0]!.auto) };
    },

    async getTransaction(id) {
      const rows = await db.query<TransactionSql>(`select ${TRANSACTION_COLS} from transaction t where t.id = $1`, [id]);
      return (await toTransactionDtos(db, rows))[0] ?? null;
    },

    async patchTransaction(id, patch) {
      const sets: string[] = [];
      const params: unknown[] = [id];
      if (patch.categoryId !== undefined) {
        params.push(patch.categoryId);
        sets.push(`category_id = $${params.length}::int`, `category_source = 'user'`, 'categorised = true');
      }
      if (patch.flow !== undefined) {
        params.push(patch.flow);
        sets.push(`flow = $${params.length}::text`, `flow_source = 'user'`);
      }
      if (patch.note !== undefined) {
        params.push(patch.note);
        sets.push(`note = $${params.length}::text`);
      }
      if (sets.length) {
        // One statement. A flow edit on a paired row gives the partner the same flow, so a transfer's two halves
        // never disagree (one half counting as spending). The pair stays linked for the next edit.
        const partner = patch.flow !== undefined
          ? `, partner as (
               update transaction p set flow = $${params.indexOf(patch.flow) + 1}::text, flow_source = 'user'
               from old where p.id = old.pair_id
             )`
          : '';
        const done = await db.query(
          `with old as (select pair_id from transaction where id = $1 and pair_id is not null)${partner},
           upd as (update transaction set ${sets.join(', ')} where id = $1 returning id)
           select id from upd`,
          params,
        );
        if (!done.length) return null;
      }
      return this.getTransaction(id);
    },

    async setSplits(id, splits) {
      // One statement: the delete and insert see the same snapshot, so the new parts are never deleted.
      const found = await db.query<{ n: string | number }>(
        `with t as (select id from transaction where id = $1),
         del as (delete from transaction_split where transaction_id in (select id from t)),
         ins as (
           insert into transaction_split (transaction_id, category_id, amount_cents)
           select t.id, v.category_id, v.amount_cents
           from t, unnest($2::int[], $3::bigint[]) with ordinality as v(category_id, amount_cents, n)
           order by v.n
         )
         select count(*) as n from t`,
        [id, splits.map((p) => p.categoryId), splits.map((p) => p.amountCents)],
      );
      if (!Number(found[0]!.n)) return null;
      return this.getTransaction(id);
    },

    async createCategory(c) {
      const rows = await db.query<CategoryDto>(
        `insert into category (name, emoji, color, kind, sort)
         select $1, $2, $3, $4, coalesce(max(sort), 0) + 1 from category
         on conflict (name) do nothing
         returning id, name, emoji, color, kind, sort`,
        [c.name, c.emoji, c.color, c.kind],
      );
      return rows[0] ? { ...rows[0], id: Number(rows[0].id), sort: Number(rows[0].sort) } : null;
    },

    async listRulesWithMatches() {
      const counts = await db.query<{ id: number; matches: string | number }>(
        `select r.id, count(t.id) as matches from rule r
         left join transaction t on (strpos(upper(t.description_raw), upper(r.match_text)) > 0
             or strpos(upper(t.merchant), upper(r.match_text)) > 0)
           and (r.account_id is null or t.account_id = r.account_id)
           and (r.amount_cents is null or t.amount_cents = r.amount_cents)
         group by r.id`,
      );
      const byId = new Map(counts.map((c) => [Number(c.id), Number(c.matches)]));
      return (await this.listRules()).map((r) => ({ ...r, matches: byId.get(r.id) ?? 0 }));
    },

    async previewRule(m, categoryId) {
      const rows = await db.query<{ n: string | number; hand: string | number }>(
        `select count(*) filter (where t.category_source is distinct from 'user') as n,
           count(*) filter (where t.category_source = 'user' and $4::int is not null) as hand
         from transaction t
         where ${RULE_MATCH_SQL} and ($4::int is null or t.category_id is distinct from $4::int)`,
        [m.matchText, m.accountId, m.amountCents, categoryId],
      );
      return { matches: Number(rows[0]!.n), handSorted: Number(rows[0]!.hand) };
    },

    async createRule(r, applyToPast, includeHandSorted = false) {
      const created = await db.query<RuleSql>(
        `insert into rule (origin, match_text, account_id, amount_cents, category_id, flow)
         values ($1, $2, $3, $4, $5, $6) returning ${RULE_COLS}`,
        [r.origin, r.matchText, r.accountId, r.amountCents, r.categoryId, r.flow],
      );
      const rule = toRule(created[0]!);
      if (!applyToPast) return { rule, updated: 0 };
      // Rows the owner categorised are skipped unless asked for, and then keep their 'user' source; a row whose
      // flow the owner set keeps that flow.
      const rows = await db.query(
        `update transaction t set
           category_id = case when $4::int is not null then $4::int else t.category_id end,
           category_source = case when $4::int is not null and t.category_source is distinct from 'user' then $5::text
             else t.category_source end,
           flow = case when $6::text is not null and t.flow_source <> 'user' then $6::text else t.flow end,
           pair_id = case when $6::text is not null and t.flow_source <> 'user' then null else t.pair_id end,
           flow_source = case when $6::text is not null and t.flow_source <> 'user' then 'rule' else t.flow_source end
         where ${RULE_MATCH_SQL}
           and (t.category_source is distinct from 'user' or ($7::boolean and $4::int is not null))
         returning t.id`,
        [r.matchText, r.accountId, r.amountCents, r.categoryId, r.origin === 'learned' ? 'learned' : 'rule', r.flow, includeHandSorted],
      );
      return { rule, updated: rows.length };
    },

    async deleteRule(id) {
      return (await db.query('delete from rule where id = $1 returning id', [id])).length > 0;
    },

    async transactionsNear(accountId, from, to) {
      const rows = await db.query<{ date: string; amount_cents: string | number; description_raw: string }>(
        `select to_char(date, 'YYYY-MM-DD') as date, amount_cents::text as amount_cents, description_raw
         from transaction
         where account_id = $1 and source = 'pocketsmith' and date >= $2::date and date <= $3::date
         order by date, id`,
        [accountId, from, to],
      );
      return rows.map((r) => ({ date: r.date, amountCents: Number(r.amount_cents), description: r.description_raw }));
    },

    async startSync(now) {
      const cutoff = new Date(now.getTime() - SYNC_LOCK_MS);
      const rows = await db.query<{ id: number }>(
        `insert into sync_log (started_at, status)
         select $1::timestamptz, 'running'
         where not exists (select 1 from sync_log where status = 'running' and started_at > $2::timestamptz)
         returning id`,
        [now.toISOString(), cutoff.toISOString()],
      );
      return rows[0] ? Number(rows[0].id) : null;
    },

    async finishSync(id, result, now) {
      await db.query(
        `update sync_log set status = $2, error = $3, accounts_synced = $4, transactions_upserted = $5,
           finished_at = $6::timestamptz, more = $7 where id = $1`,
        [
          id, result.status, result.error ?? null, result.accounts ?? null, result.transactions ?? null,
          now.toISOString(), result.more ?? false,
        ],
      );
    },

    async lastOkSync() {
      const rows = await db.query<{ started_at: unknown; more: boolean }>(
        `select started_at, more from sync_log where status = 'ok' order by started_at desc limit 1`,
      );
      const r = rows[0];
      return r ? { startedAt: asDate(r.started_at), more: r.more } : null;
    },

    async lastSuccessfulSync() {
      const rows = await db.query<{ started_at: unknown; finished_at: unknown }>(
        `select started_at, finished_at from sync_log
         where status = 'ok' and finished_at is not null order by started_at desc limit 1`,
      );
      const r = rows[0];
      return r ? { startedAt: asDate(r.started_at), finishedAt: asDate(r.finished_at) } : null;
    },

    async lastSyncStatus() {
      const rows = await db.query<{ status: 'ok' | 'failed' | 'running' }>(
        'select status from sync_log order by started_at desc, id desc limit 1',
      );
      return rows[0]?.status ?? null;
    },

    async bankDataTimes() {
      return db.query<{ institution: string; at: string; checkedAt: string | null }>(
        `select a.institution, to_char(max(t.feed_created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at,
           to_char(max(a.feed_updated_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "checkedAt"
         from transaction t join account a on a.id = t.account_id
         where a.source = 'pocketsmith' and t.feed_created_at is not null
         group by a.institution
         order by max(t.feed_created_at) desc`,
      );
    },

    async listCategories() {
      const rows = await db.query<CategoryDto>('select id, name, emoji, color, kind, sort from category order by sort, id');
      return rows.map((r) => ({ ...r, id: Number(r.id), sort: Number(r.sort) }));
    },

    async categoryNames() {
      const rows = await db.query<{ id: number; name: string; aliases: string[] }>('select id, name, aliases from category');
      return rows.map((r) => ({ ...r, id: Number(r.id) }));
    },

    async updateCategory(id, patch) {
      const taken = patch.name === undefined ? [] : await db.query('select 1 from category where name = $1 and id <> $2', [patch.name, id]);
      if (taken.length) return 'exists';
      const rows = await db.query<CategoryDto>(
        `update category set
           aliases = case when $2::text is not null and $2::text <> name and not (name = any(aliases)) then aliases || name else aliases end,
           name = coalesce($2::text, name), emoji = coalesce($3::text, emoji), color = coalesce($4::text, color)
         where id = $1
         returning id, name, emoji, color, kind, sort`,
        [id, patch.name ?? null, patch.emoji ?? null, patch.color ?? null],
      );
      return rows[0] ? { ...rows[0], id: Number(rows[0].id), sort: Number(rows[0].sort) } : null;
    },

    async mergeCategory(from, into) {
      const found = await db.query<{ n: string | number }>('select count(*) as n from category where id = any($1::int[])', [[from, into]]);
      if (Number(found[0]!.n) !== 2) return false;
      await db.query('update transaction set category_id = $2 where category_id = $1', [from, into]);
      await db.query('update transaction_split set category_id = $2 where category_id = $1', [from, into]);
      await db.query('update rule set category_id = $2 where category_id = $1', [from, into]);
      await db.query('update carried_edit set category_id = $2 where category_id = $1', [from, into]);
      await db.query(
        `update spending_limit set category_id = $2 where category_id = $1 and not exists (select 1 from spending_limit where category_id = $2)`,
        [from, into],
      );
      await db.query('delete from spending_limit where category_id = $1', [from]);
      await db.query(
        `update category t set aliases = array(select distinct unnest(t.aliases || f.aliases || f.name))
         from category f where t.id = $2 and f.id = $1`,
        [from, into],
      );
      // A split that now has two parts in `into` gets them added together.
      await db.query(
        `with dup as (
           delete from transaction_split where category_id = $1 and transaction_id in
             (select transaction_id from transaction_split where category_id = $1 group by transaction_id having count(*) > 1)
           returning transaction_id, amount_cents)
         insert into transaction_split (transaction_id, category_id, amount_cents)
         select transaction_id, $1, sum(amount_cents) from dup group by transaction_id`,
        [into],
      );
      // A split left with one part is a plain row again.
      await db.query(
        `with lone as (
           delete from transaction_split where transaction_id in
             (select transaction_id from transaction_split group by transaction_id having count(*) = 1)
             and category_id = $1
           returning transaction_id)
         update transaction t set category_id = $1 from lone where t.id = lone.transaction_id`,
        [into],
      );
      await db.query('delete from category where id = $1', [from]);
      return true;
    },

    async deleteCategory(id) {
      if (!(await db.query('select 1 from category where id = $1', [id])).length) return false;
      // A split with a part in this category no longer adds up, so the whole row starts over.
      await db.query(
        `with gone as (
           delete from transaction_split where transaction_id in (select transaction_id from transaction_split where category_id = $1)
           returning transaction_id)
         update transaction t set category_id = null, category_source = null, categorised = false
         where t.id in (select transaction_id from gone)`,
        [id],
      );
      await db.query('update transaction set category_id = null, category_source = null, categorised = false where category_id = $1', [id]);
      await db.query('update rule set category_id = null where category_id = $1 and flow is not null', [id]);
      await db.query('delete from rule where category_id = $1', [id]);
      await db.query('delete from spending_limit where category_id = $1', [id]);
      await db.query('delete from category where id = $1', [id]);
      return true;
    },

    async setCategoryOrder(ids) {
      if (new Set(ids).size !== ids.length) return false;
      const found = await db.query<{ n: string | number }>('select count(*) as n from category where id = any($1::int[])', [ids]);
      if (Number(found[0]!.n) !== ids.length) return false;
      await db.query(
        `update category c set sort = o.ord
         from (select category.id, row_number() over (order by u.pos nulls last, category.sort, category.id) as ord
               from category left join unnest($1::int[]) with ordinality as u(id, pos) on u.id = category.id) o
         where c.id = o.id`,
        [ids],
      );
      return true;
    },

    async listRules() {
      const rows = await db.query<RuleSql>(`select ${RULE_COLS} from rule order by id`);
      return rows.map(toRule);
    },

    async pastByMerchant() {
      const rows = await db.query<{ merchant: string; category_id: number }>(
        `select distinct on (merchant) merchant, category_id from transaction
         where category_source = 'user' and category_id is not null and merchant <> ''
         order by merchant, date desc, id desc`,
      );
      return new Map(rows.map((r) => [r.merchant, Number(r.category_id)]));
    },

    async uncategorisedForPipeline(limit) {
      const rows = await db.query<{
        id: string | number;
        account_id: number;
        date: string;
        amount_cents: string | number;
        description_raw: string;
        merchant: string;
        ps_category: string | null;
        is_credit_card: boolean;
      }>(
        `select t.id, t.account_id, to_char(t.date, 'YYYY-MM-DD') as date, t.amount_cents::text as amount_cents,
           t.description_raw, t.merchant, t.ps_category, a.kind = 'credit_card' as is_credit_card
         from transaction t join account a on a.id = t.account_id
         where not t.categorised and (t.source = 'csv' or a.history_done)
         order by t.date, t.id
         limit $1`,
        [limit],
      );
      return rows.map((r) => ({
        id: Number(r.id),
        accountId: Number(r.account_id),
        date: r.date,
        amountCents: Number(r.amount_cents),
        description: r.description_raw,
        merchant: r.merchant,
        psCategory: r.ps_category,
        isCreditCard: r.is_credit_card,
      }));
    },

    async applyCarriedEdits(now) {
      // Each edit takes its closest candidate, then each candidate keeps its closest edit, so every edit lands at most
      // once and no row receives two. All CTEs see the same snapshot, so `e` still holds the expired edits: filter them.
      const rows = await db.query<{ applied: string | number; expired: string | number }>(
        `with expired as (
           delete from carried_edit where created_at < $1::timestamptz - interval '7 days' returning id
         ), e as (
           select id as edit_id, account_id, amount_cents, date, category_id, category_source = 'user' as user_category,
             flow, flow_source = 'user' as user_flow, note, created_at
           from carried_edit where created_at >= $1::timestamptz - interval '7 days'
         ), c as (
           select e.*, t.id as target, abs(t.date - e.date) as gap,
             row_number() over (partition by e.edit_id order by abs(t.date - e.date), t.id) as edit_rank
           from e join transaction t on t.account_id = e.account_id and t.amount_cents = e.amount_cents
             and abs(t.date - e.date) <= 3
             and t.category_source is distinct from 'user' and t.flow_source <> 'user'
             and (t.feed_created_at is null or t.feed_created_at >= e.created_at - interval '1 day')
         ), best as (
           select *, row_number() over (partition by target order by gap, edit_id) as target_rank from c where edit_rank = 1
         ), upd as (
           update transaction t set
             category_id = case when b.user_category then b.category_id else t.category_id end,
             category_source = case when b.user_category then 'user' else t.category_source end,
             flow = case when b.user_flow then b.flow else t.flow end,
             flow_source = case when b.user_flow then 'user' else t.flow_source end,
             pair_id = case when b.user_flow then null else t.pair_id end,
             note = coalesce(b.note, t.note)
           from best b
           where b.target_rank = 1 and t.id = b.target
           returning b.edit_id
         ), done as (
           delete from carried_edit where id in (select edit_id from upd)
         )
         select (select count(*) from upd) as applied, (select count(*) from expired) as expired`,
        [now.toISOString()],
      );
      return { applied: Number(rows[0]!.applied), expired: Number(rows[0]!.expired) };
    },

    async applyCategorisation(rows) {
      for (const part of chunks(rows, BULK_CHUNK)) {
        // A row the owner categorised keeps its category, and one whose flow they set keeps its flow, even if they
        // edited it after the pipeline read it. A rule's flow replaces a detected one and drops any transfer pair.
        await db.query(
          `update transaction t set
             category_id = case when t.category_source = 'user' then t.category_id else v.category_id end,
             category_source = case when t.category_source = 'user' then 'user' else v.source end,
             initial_source = coalesce(t.initial_source, v.source),
             categorised = true,
             flow = case when v.flow is not null and t.flow_source <> 'user' then v.flow else t.flow end,
             pair_id = case when v.flow is not null and t.flow_source <> 'user' then null else t.pair_id end,
             flow_source = case when v.flow is not null and t.flow_source <> 'user' then 'rule' else t.flow_source end,
             merchant = v.merchant
           from unnest($1::bigint[], $2::int[], $3::text[], $4::text[], $5::text[]) as v(id, category_id, source, flow, merchant)
           where t.id = v.id`,
          [
            part.map((r) => r.id),
            part.map((r) => r.categoryId),
            part.map((r) => r.source),
            part.map((r) => r.flow),
            part.map((r) => r.merchant),
          ],
        );
      }
    },

    async flowTxnsSince(from) {
      const rows = await db.query<{
        id: string | number;
        account_id: number;
        kind: AccountKind;
        date: string;
        amount_cents: string | number;
        description_raw: string;
        flow: Flow;
        flow_source: 'auto' | 'user' | 'rule';
      }>(
        `select t.id, t.account_id, a.kind, to_char(t.date, 'YYYY-MM-DD') as date, t.amount_cents::text as amount_cents,
           t.description_raw, t.flow, t.flow_source
         from transaction t join account a on a.id = t.account_id
         where t.date >= $1::date`,
        [from],
      );
      return rows.map((r) => ({
        id: Number(r.id),
        accountId: Number(r.account_id),
        accountKind: r.kind,
        date: r.date,
        amountCents: Number(r.amount_cents),
        description: r.description_raw,
        flow: r.flow,
        flowSource: r.flow_source,
      }));
    },

    async applyFlows(decisions) {
      let changed = 0;
      for (const part of chunks([...decisions], BULK_CHUNK)) {
        const rows = await db.query(
          `update transaction t set flow = v.flow, pair_id = v.pair_id
           from unnest($1::bigint[], $2::text[], $3::bigint[]) as v(id, flow, pair_id)
           where t.id = v.id and t.flow_source = 'auto' and (t.flow, t.pair_id) is distinct from (v.flow, v.pair_id)
           returning t.id`,
          [part.map(([id]) => id), part.map(([, d]) => d.flow), part.map(([, d]) => d.pairId)],
        );
        changed += rows.length;
      }
      return changed;
    },
  };
}
