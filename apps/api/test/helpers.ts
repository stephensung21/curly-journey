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
  } = {},
): PocketSmithClient & { calls: string[] } {
  const calls: string[] = [];
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
    async transactions(accountId, opts) {
      calls.push(`transactions:${accountId}:${opts.updatedSince ?? ''}`);
      if (accountId === data.failOnAccount) throw new Error(`PocketSmith failed for account ${accountId}`);
      return data.transactions?.[accountId] ?? [];
    },
  };
}
