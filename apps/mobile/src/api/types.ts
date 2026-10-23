import type { CategoryColor, CategorySource, Flow as CoreFlow, Rule as CoreRule, Summary } from '@curly/core';

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
  icon: string | null;
  sortOrder: number | null;
  stale: boolean;
};

export type AccountsResponse = { accounts: Account[]; lastSuccessAt: string | null };

export type AccountSettings = Partial<
  Pick<Account, 'displayName' | 'countsSpending' | 'countsNetWorth' | 'projections' | 'isOffset' | 'icon'>
>;

export type Flow = CoreFlow;

export type Transaction = {
  id: number;
  accountId: number;
  date: string;
  amountCents: number;
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
  feedCreatedAt: string | null;
  splits: { categoryId: number; amountCents: number }[];
};

export type TransactionPatch = { categoryId?: number | null; flow?: Flow; note?: string | null };

export type TransactionQuery = {
  month: string;
  period?: 'statement';
  accountId?: number;
  categoryId?: number | 'none';
  institution?: string;
};

export type Category = {
  id: number;
  name: string;
  emoji: string;
  color: CategoryColor;
  kind: 'spending' | 'income';
  sort: number;
};
export type NewCategory = Pick<Category, 'name' | 'emoji' | 'color' | 'kind'>;

export type Rule = CoreRule & { matches: number };
export type NewRule = {
  origin: 'user' | 'learned';
  matchText: string;
  accountId?: number | null;
  amountCents?: number | null;
  categoryId?: number | null;
  flow?: Flow | null;
  applyToPast: boolean;
};
export type RulePreviewParams = { matchText: string; accountId?: number; amountCents?: number; categoryId?: number };

export type SpendingQuery = { month: string; period?: 'statement'; accountId?: number; institution?: string };
export type SpendingSummary = Summary & { from: string; to: string; prevTotalCents: number };
export type InOutMonth = { month: string; inCents: number; mortgageCents: number; spendingCents: number };
export type DailyPoint = { day: number; inCents: number; mortgageCents: number; spendingCents: number };
export type InboxItem = Transaction & { guesses: number[] };
export type InboxResponse = { items: InboxItem[]; total: number };
export type CategorisationStats = { autoPercent: number | null; sample: number };

export type TransactionsResponse = {
  transactions: Transaction[];
  /** With a categoryId: that category's Spending bar for the same filters (split parts count separately). */
  totalCents?: number;
};

export type SyncResult = {
  status?: string;
  accounts?: number;
  transactions?: number;
  more?: boolean;
  error?: 'sync_in_progress' | 'sync_failed';
};

export type SyncStatus = { lastSuccessAt: string | null; lastStatus: 'ok' | 'failed' | 'running' | null; stale: boolean };

export type ImportFormat = 'commbank' | 'amex';
export type ImportBody = { accountId: number; format: ImportFormat; csv: string };
export type ImportedRow = { date: string; amountCents: number; description: string };
export type ImportPreview = { new: ImportedRow[]; duplicates: ImportedRow[]; skipped: { line: number; reason: string }[] };
export type ImportCommit = { inserted: number };
