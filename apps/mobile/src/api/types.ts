export type Connection = { url: string; token: string };

export type AccountKind = 'transaction' | 'savings' | 'credit_card' | 'mortgage' | 'brokerage' | 'manual_asset';

export type Account = {
  id: number;
  source: 'pocketsmith' | 'manual';
  institution: string;
  name: string;
  displayName: string | null;
  kind: AccountKind;
  balanceCents: number;
  balanceDate: string | null;
  countsSpending: boolean;
  countsNetWorth: boolean;
  projections: 'off' | 'etf' | 'mortgage';
  isOffset: boolean;
  stale: boolean;
};

export type AccountsResponse = { accounts: Account[]; lastSuccessAt: string | null };

export type AccountSettings = Partial<
  Pick<Account, 'displayName' | 'countsSpending' | 'countsNetWorth' | 'projections' | 'isOffset'>
>;

export type Transaction = {
  id: number;
  date: string;
  amountCents: number;
  description: string;
  status: 'posted' | 'pending';
  source: 'pocketsmith' | 'csv';
};

export type TransactionsResponse = { transactions: Transaction[] };

export type SyncResult = { status?: string; accounts?: number; transactions?: number; error?: 'sync_in_progress' | 'sync_failed' };

export type SyncStatus = { lastSuccessAt: string | null; lastStatus: 'ok' | 'failed' | 'running' | null; stale: boolean };

export type ImportFormat = 'commbank' | 'amex';
export type ImportBody = { accountId: number; format: ImportFormat; csv: string };
export type ImportedRow = { date: string; amountCents: number; description: string };
export type ImportPreview = { new: ImportedRow[]; duplicates: ImportedRow[]; skipped: { line: number; reason: string }[] };
export type ImportCommit = { inserted: number };
