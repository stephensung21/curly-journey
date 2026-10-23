import type { PsTransaction, PsTransactionAccount } from '@curly/core';

export type TransactionQuery = { updatedSince?: string; startDate?: string; endDate?: string };

export interface PocketSmithClient {
  me(): Promise<{ id: number }>;
  transactionAccounts(userId: number): Promise<PsTransactionAccount[]>;
  /** One page. Pass the previous page's `next` to continue; the caller drives pagination so it can count requests. */
  transactionsPage(accountId: number, query: TransactionQuery, pageUrl?: string): Promise<{ items: PsTransaction[]; next: string | null }>;
  /** One page of every account's transactions (`/users/{id}/transactions`), paginated the same way. */
  userTransactionsPage(userId: number, query: TransactionQuery, pageUrl?: string): Promise<{ items: PsTransaction[]; next: string | null }>;
}
