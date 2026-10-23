import {
  addMonths,
  defaultCounts,
  type AccountKind,
  type AccountRow,
  type Cents,
  type ImportedRow,
  type ProjectionsRole,
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

export type AccountSettingsPatch = Partial<
  Pick<AccountDto, 'countsSpending' | 'countsNetWorth' | 'projections' | 'isOffset' | 'displayName'>
>;

export interface Repo {
  upsertAccount(row: AccountRow): Promise<number>;
  upsertTransactions(accountId: number, rows: TransactionRow[]): Promise<number>;
  insertCsvRows(accountId: number, rows: { row: ImportedRow; fingerprint: string }[]): Promise<number>;
  listAccounts(): Promise<AccountDto[]>;
  getAccount(id: number): Promise<AccountDto | null>;
  existingCsvKeys(accountId: number, keys: string[]): Promise<Set<string>>;
  updateAccountSettings(id: number, patch: AccountSettingsPatch): Promise<AccountDto | null>;
  listTransactions(accountId: number, month: string): Promise<TransactionDto[]>;
  transactionsNear(accountId: number, from: string, to: string): Promise<ImportedRow[]>;
  startSync(now: Date): Promise<number | null>;
  finishSync(
    id: number,
    result: { status: 'ok' | 'failed'; error?: string; accounts?: number; transactions?: number },
    now: Date,
  ): Promise<void>;
  lastSuccessfulSync(): Promise<{ startedAt: Date; finishedAt: Date } | null>;
  lastSyncStatus(): Promise<'ok' | 'failed' | 'running' | null>;
}

const SYNC_LOCK_MS = 10 * 60 * 1000;
const CHUNK = 100;

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
      const counts = defaultCounts(row.kind);
      const rows = await db.query<{ id: number }>(
        `insert into account (source, external_id, institution, name, kind, balance_cents, balance_date,
           counts_spending, counts_net_worth, projections)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (source, external_id) do update set
           institution = excluded.institution, name = excluded.name, kind = excluded.kind,
           balance_cents = excluded.balance_cents, balance_date = excluded.balance_date
         returning id`,
        [
          row.source, row.externalId, row.institution, row.name, row.kind, row.balanceCents, row.balanceDate,
          counts.countsSpending, counts.countsNetWorth, counts.projections,
        ],
      );
      return Number(rows[0]!.id);
    },

    async upsertTransactions(accountId, rows) {
      // Last write wins within a batch; Postgres rejects a conflict target hit twice in one statement.
      const byKey = new Map(rows.map((r) => [`${r.source}|${r.externalId}`, r]));
      let affected = 0;
      for (const part of chunks([...byKey.values()], CHUNK)) {
        const params: unknown[] = [];
        const values = part.map((r) => {
          const i = params.length;
          params.push(accountId, r.source, r.externalId, r.date, r.amountCents, r.descriptionRaw, r.payee, r.status);
          return `($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, $${i + 8})`;
        });
        const res = await db.query(
          `insert into transaction (account_id, source, external_id, date, amount_cents, description_raw, payee, status)
           values ${values.join(', ')}
           on conflict (source, external_id) do update set
             date = excluded.date, amount_cents = excluded.amount_cents,
             payee = excluded.payee, status = excluded.status
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
          params.push(accountId, fingerprint, row.date, row.amountCents, row.description);
          return `($${i + 1}, 'csv', $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5})`;
        });
        const res = await db.query(
          `insert into transaction (account_id, source, external_id, date, amount_cents, description_raw)
           values ${values.join(', ')}
           on conflict (source, external_id) do nothing
           returning id`,
          params,
        );
        inserted += res.length;
      }
      return inserted;
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
         where account_id = $1 and date >= $2::date and date <= $3::date
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
           finished_at = $6::timestamptz where id = $1`,
        [id, result.status, result.error ?? null, result.accounts ?? null, result.transactions ?? null, now.toISOString()],
      );
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
  };
}
