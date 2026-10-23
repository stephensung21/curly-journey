import type { PsTransaction, PsTransactionAccount } from '@curly/core';

/** A PocketSmith response that was not 2xx. */
export class PocketSmithError extends Error {
  constructor(readonly status: number) {
    super(`PocketSmith request failed with status ${status}`);
  }
}

export type TransactionQuery = { updatedSince?: string; startDate?: string; endDate?: string };

export interface PocketSmithClient {
  me(): Promise<{ id: number }>;
  transactionAccounts(userId: number): Promise<PsTransactionAccount[]>;
  /** One page. Pass the previous page's `next` to continue; the caller drives pagination so it can count requests. */
  transactionsPage(accountId: number, query: TransactionQuery, pageUrl?: string): Promise<{ items: PsTransaction[]; next: string | null }>;
  /** One page of every account's transactions (`/users/{id}/transactions`), paginated the same way. */
  userTransactionsPage(userId: number, query: TransactionQuery, pageUrl?: string): Promise<{ items: PsTransaction[]; next: string | null }>;
}
