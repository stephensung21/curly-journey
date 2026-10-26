import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PsTransaction, PsTransactionAccount } from '@curly/core';
import type { Db } from '../src/db/db';
import { hashToken } from '../src/auth';
import type { PocketSmithClient } from '../src/pocketsmith';

export async function pgliteDb(): Promise<Db> {
  const pg = new PGlite();
  const dir = join(__dirname, '..', 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    await pg.exec(readFileSync(join(dir, f), 'utf8'));
  }
  return {
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
      return (await pg.query<T>(text, params)).rows;
    },
  };
}

export async function seedToken(db: Db, token = 'cj_test_token'): Promise<string> {
  await db.query('insert into api_token (token_hash) values ($1)', [await hashToken(token)]);
  return token;
}

export function fakePocketSmith(
  data: {
    accounts?: PsTransactionAccount[];
    transactions?: Record<number, PsTransaction[]>;
    failOnAccount?: number;
    /** Only this account's own history pages fail; the all-accounts endpoint still works. */
    failHistoryOnAccount?: number;
    pageSize?: number;
    /** Every page of this account links to the same next page, to exercise the loop guard. */
    loopOnAccount?: number;
  } = {},
): PocketSmithClient & { calls: string[] } {
  const calls: string[] = [];
  const size = data.pageSize ?? 100;
  return {
    calls,
    async me() {
      calls.push('me');
      return { id: 1 };
    },
    async transactionAccounts(userId) {
      calls.push(`transactionAccounts:${userId}`);
      return data.accounts ?? [];
    },
    async transactionsPage(accountId, opts, pageUrl) {
      const page = pageUrl ? Number(new URL(pageUrl).searchParams.get('page')) : 1;
      calls.push(`transactions:${accountId}:${opts.updatedSince ?? ''}:${opts.startDate ?? ''}:${opts.endDate ?? ''}:${page}`);
      if (accountId === data.failOnAccount || accountId === data.failHistoryOnAccount) throw new Error(`PocketSmith failed for account ${accountId}`);
      const base = `https://api.pocketsmith.com/v2/transaction_accounts/${accountId}/transactions`;
      if (accountId === data.loopOnAccount) return { items: [], next: `${base}?page=2` };
      const all = (data.transactions?.[accountId] ?? []).filter(
        (t) =>
          (!opts.updatedSince || t.updated_at >= opts.updatedSince) &&
          (!opts.startDate || t.date >= opts.startDate) &&
          (!opts.endDate || t.date <= opts.endDate),
      );
      const items = all.slice((page - 1) * size, page * size);
      return { items, next: page * size < all.length ? `${base}?page=${page + 1}` : null };
    },
    async userTransactionsPage(userId, opts, pageUrl) {
      const page = pageUrl ? Number(new URL(pageUrl).searchParams.get('page')) : 1;
      calls.push(`userTransactions:${userId}:${opts.startDate ?? ''}:${opts.endDate ?? ''}:${page}`);
      // Every account's data is served here, so a failing account fails this endpoint too.
      if (data.failOnAccount !== undefined) throw new Error(`PocketSmith failed for account ${data.failOnAccount}`);
      const base = `https://api.pocketsmith.com/v2/users/${userId}/transactions`;
      const all = Object.values(data.transactions ?? {})
        .flat()
        .filter((t) => (!opts.startDate || t.date >= opts.startDate) && (!opts.endDate || t.date <= opts.endDate));
      const items = all.slice((page - 1) * size, page * size);
      return { items, next: page * size < all.length ? `${base}?page=${page + 1}` : null };
    },
  };
}
