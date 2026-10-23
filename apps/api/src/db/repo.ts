import {
  addMonths,
  cleanMerchant,
  defaultCounts,
  type AccountKind,
  type AccountRow,
  type CategoriseInput,
  type Cents,
  type Flow,
  type FlowTxn,
  type ImportedRow,
  type ProjectionsRole,
  type Rule,
  type TransactionRow,
} from '@curly/core';
import type { Db } from './db';

export type AccountDto = {
  id: number;
  institution: string;
  name: string;
  displayName: string | null;
  source: 'pocketsmith' | 'manual';
  kind: AccountKind;
  balanceCents: Cents;
  balanceDate: string | null;
  countsSpending: boolean;
  countsNetWorth: boolean;
  projections: ProjectionsRole;
  isOffset: boolean;
};

export type TransactionDto = {
  id: number;
  date: string;
  amountCents: Cents;
  description: string;
  status: 'posted' | 'pending';
  source: 'pocketsmith' | 'csv';
};

export type CategoryDto = {
  id: number;
  name: string;
  emoji: string;
  color: string;
  kind: 'spending' | 'income';
  sort: number;
};

/** The owner's edits on a feed row that reconciliation deleted, to carry over to the row that replaced it. */
export type CarriedEdit = {
  accountId: number;
  amountCents: Cents;
  date: string;
  categoryId: number | null;
  categorySource: string | null;
  flow: Flow;
  flowSource: 'auto' | 'user' | 'rule';
  note: string | null;
};

export type UncategorisedRow = CategoriseInput & { id: number; date: string };

export type CategorisationUpdate = {
  id: number;
  categoryId: number | null;
  source: string | null;
  flow: Flow | null;
  ruleId: number | null;
};

export type AccountSettingsPatch = Partial<
  Pick<AccountDto, 'countsSpending' | 'countsNetWorth' | 'projections' | 'isOffset' | 'displayName'>
>;

export type HistoryState = {
  id: number;
  historyFrom: string | null;
  historyDone: boolean;
  /** Next page of the history window in progress, when the last run ran out of budget part-way through it. */
  historyCursor: string | null;
};

export interface Repo {
  upsertAccount(row: AccountRow): Promise<number>;
  /** Upsert, returning how far back this account's history has been fetched. */
  upsertAccountState(row: AccountRow): Promise<HistoryState>;
  /** Upserts every account in one query; results are in input order. */
  upsertAccountStates(rows: AccountRow[]): Promise<HistoryState[]>;
  /** Records a completed history window and clears the resume cursor. */
  setHistory(id: number, from: string, done: boolean): Promise<void>;
  setHistoryCursor(id: number, cursor: string): Promise<void>;
  upsertTransactions(accountId: number, rows: TransactionRow[]): Promise<number>;
  /** Like upsertTransactions, for rows of several accounts at once (one query per 100 rows). */
  upsertFeedTransactions(rows: { accountId: number; row: TransactionRow }[]): Promise<number>;
  insertCsvRows(accountId: number, rows: { row: ImportedRow; fingerprint: string }[]): Promise<number>;
  /**
   * Deletes these accounts' feed rows dated `from` to `to` whose external ID is not in `keep`. CSV rows are never
   * touched. Returns how many were deleted and the owner's edits on them (rows with a user category or flow).
   */
  deleteMissingFeedRows(
    accountIds: number[],
    from: string,
    to: string,
    keep: string[],
  ): Promise<{ deleted: number; edits: CarriedEdit[] }>;
  listAccounts(): Promise<AccountDto[]>;
  getAccount(id: number): Promise<AccountDto | null>;
  existingCsvKeys(accountId: number, keys: string[]): Promise<Set<string>>;
  updateAccountSettings(id: number, patch: AccountSettingsPatch): Promise<AccountDto | null>;
  listTransactions(accountId: number, month: string): Promise<TransactionDto[]>;
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
  listCategories(): Promise<CategoryDto[]>;
  listRules(): Promise<Rule[]>;
  /** merchant -> category of the latest row the owner categorised. */
  pastByMerchant(): Promise<Map<string, number>>;
  /** Up to `limit` rows with categorised = false, oldest first. */
  uncategorisedForPipeline(limit: number): Promise<UncategorisedRow[]>;
  /**
   * Copies each edit onto one matching new row (same account and amount, dated within 3 days, not yet categorised,
   * not itself user-set; closest date, then lowest id), in one query. Returns how many rows were updated.
   */
  carryEdits(edits: CarriedEdit[]): Promise<number>;
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
const ACCOUNT_COLS = `id, source, institution, name, display_name, kind, balance_cents::text as balance_cents,
  to_char(balance_date, 'YYYY-MM-DD') as balance_date, counts_spending, counts_net_worth, projections, is_offset`;

type AccountSql = {
  id: number;
  source: 'pocketsmith' | 'manual';
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
};

const toAccountDto = (r: AccountSql): AccountDto => ({
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
});

const asDate = (v: unknown): Date => (v instanceof Date ? v : new Date(String(v)));

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
          counts.countsSpending, counts.countsNetWorth, counts.projections,
        );
        return `(${Array.from({ length: 10 }, (_, k) => `$${i + k + 1}`).join(', ')})`;
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
           counts_spending, counts_net_worth, projections)
         values ${values.join(', ')}
         on conflict (source, external_id) do update set
           institution = excluded.institution, name = excluded.name, kind = excluded.kind,
           balance_cents = excluded.balance_cents, balance_date = excluded.balance_date
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

    async deleteMissingFeedRows(accountIds, from, to, keep) {
      if (!accountIds.length) return { deleted: 0, edits: [] };
      const rows = await db.query<{
        account_id: number;
        amount_cents: string | number;
        date: string;
        category_id: number | null;
        category_source: string | null;
        flow: Flow;
        flow_source: 'auto' | 'user' | 'rule';
        note: string | null;
      }>(
        `delete from transaction
         where account_id = any($1::int[]) and source = 'pocketsmith' and date >= $2::date and date <= $3::date
           and external_id <> all($4::text[])
         returning account_id, amount_cents::text as amount_cents, to_char(date, 'YYYY-MM-DD') as date, category_id,
           category_source, flow, flow_source, note`,
        [accountIds, from, to, keep],
      );
      const edits = rows
        .filter((r) => r.category_source === 'user' || r.flow_source === 'user')
        .map((r) => ({
          accountId: Number(r.account_id),
          amountCents: Number(r.amount_cents),
          date: r.date,
          categoryId: r.category_id === null ? null : Number(r.category_id),
          categorySource: r.category_source,
          flow: r.flow,
          flowSource: r.flow_source,
          note: r.note,
        }));
      return { deleted: rows.length, edits };
    },

    async listAccounts() {
      const rows = await db.query<AccountSql>(`select ${ACCOUNT_COLS} from account order by id`);
      return rows.map(toAccountDto);
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
      const startLocal = `${month}-01`;
      const endLocal = `${addMonths(month, 1)}-01`;
      const rows = await db.query<{
        id: string | number;
        date: string;
        amount_cents: string | number;
        description_raw: string;
        status: string;
        source: 'pocketsmith' | 'csv';
      }>(
        `select id, to_char(date, 'YYYY-MM-DD') as date, amount_cents::text as amount_cents,
                description_raw, status, source
         from transaction
         where account_id = $1 and date >= $2::date and date < $3::date
         order by date desc, id desc`,
        [accountId, startLocal, endLocal],
      );
      return rows.map((r) => ({
        id: Number(r.id),
        date: r.date,
        amountCents: Number(r.amount_cents),
        description: r.description_raw,
        status: r.status === 'pending' ? 'pending' : 'posted',
        source: r.source,
      }));
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

    async listCategories() {
      const rows = await db.query<CategoryDto>('select id, name, emoji, color, kind, sort from category order by sort, id');
      return rows.map((r) => ({ ...r, id: Number(r.id), sort: Number(r.sort) }));
    },

    async listRules() {
      const rows = await db.query<{
        id: number;
        origin: 'user' | 'learned';
        match_text: string;
        account_id: number | null;
        amount_cents: string | null;
        category_id: number | null;
        flow: Flow | null;
        created_at: string;
      }>(
        `select id, origin, match_text, account_id, amount_cents::text as amount_cents, category_id, flow,
           to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at
         from rule order by id`,
      );
      return rows.map((r) => ({
        id: Number(r.id),
        origin: r.origin,
        matchText: r.match_text,
        accountId: r.account_id === null ? null : Number(r.account_id),
        amountCents: r.amount_cents === null ? null : Number(r.amount_cents),
        categoryId: r.category_id === null ? null : Number(r.category_id),
        flow: r.flow,
        createdAt: r.created_at,
      }));
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
         where not t.categorised
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

    async carryEdits(edits) {
      if (!edits.length) return 0;
      // Each edit takes its closest candidate, then each candidate keeps its closest edit, so every edit lands at most
      // once and no row receives two.
      const rows = await db.query(
        `with e as (
           select * from unnest($1::int[], $2::bigint[], $3::date[], $4::int[], $5::boolean[], $6::text[], $7::boolean[],
             $8::text[]) with ordinality as e(account_id, amount_cents, date, category_id, user_category, flow, user_flow,
             note, idx)
         ), c as (
           select e.*, t.id as target, abs(t.date - e.date) as gap,
             row_number() over (partition by e.idx order by abs(t.date - e.date), t.id) as edit_rank
           from e join transaction t on t.account_id = e.account_id and t.amount_cents = e.amount_cents
             and abs(t.date - e.date) <= 3 and not t.categorised
             and t.category_source is distinct from 'user' and t.flow_source <> 'user'
         ), best as (
           select *, row_number() over (partition by target order by gap, idx) as target_rank from c where edit_rank = 1
         )
         update transaction t set
           category_id = case when b.user_category then b.category_id else t.category_id end,
           category_source = case when b.user_category then 'user' else t.category_source end,
           flow = case when b.user_flow then b.flow else t.flow end,
           flow_source = case when b.user_flow then 'user' else t.flow_source end,
           pair_id = case when b.user_flow then null else t.pair_id end,
           note = coalesce(b.note, t.note)
         from best b
         where b.target_rank = 1 and t.id = b.target
         returning t.id`,
        [
          edits.map((e) => e.accountId),
          edits.map((e) => e.amountCents),
          edits.map((e) => e.date),
          edits.map((e) => e.categoryId),
          edits.map((e) => e.categorySource === 'user'),
          edits.map((e) => e.flow),
          edits.map((e) => e.flowSource === 'user'),
          edits.map((e) => e.note),
        ],
      );
      return rows.length;
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
             flow_source = case when v.flow is not null and t.flow_source <> 'user' then 'rule' else t.flow_source end
           from unnest($1::bigint[], $2::int[], $3::text[], $4::text[]) as v(id, category_id, source, flow)
           where t.id = v.id`,
          [part.map((r) => r.id), part.map((r) => r.categoryId), part.map((r) => r.source), part.map((r) => r.flow)],
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
