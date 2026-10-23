import type { PsTransaction, PsTransactionAccount } from '@curly/core';

export interface PocketSmithClient {
  me(): Promise<{ id: number }>;
  transactionAccounts(userId: number): Promise<PsTransactionAccount[]>;
  transactions(accountId: number, opts: { updatedSince?: string }): Promise<PsTransaction[]>;
}
