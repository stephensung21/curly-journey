import type {
  CategoryColor,
  CategorySource,
  DividendSummary as CoreDividendSummary,
  Flow as CoreFlow,
  NwLine as CoreNwLine,
  NwRange as CoreNwRange,
  ParsedTrade,
  Rule as CoreRule,
  Summary,
  ValuedEtfHolding as CoreValuedEtfHolding,
} from '@curly/core';

export type Connection = { url: string; token: string };

export type AccountKind = 'transaction' | 'savings' | 'credit_card' | 'mortgage' | 'brokerage' | 'manual_asset' | 'crypto';

export type Account = {
  id: number;
  source: 'pocketsmith' | 'manual' | 'coinspot' | 'commsec';
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
  syncedAt: string | null;
  needsUpdate: boolean;
  /** Yearly growth in basis points, manual accounts only. */
  growthBps: number | null;
  /** Left off the Accounts page. Missing from a server older than this field. */
  hidden?: boolean;
};

export type AccountValue = { asOf: string; valueCents: number };
export type Holding = { symbol: string; units: string; audCents: number };

export type AccountsResponse = { accounts: Account[]; lastSuccessAt: string | null };

export type AccountSettings = Partial<
  Pick<Account, 'displayName' | 'countsSpending' | 'countsNetWorth' | 'projections' | 'isOffset' | 'icon' | 'growthBps' | 'hidden'>
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
  /** Also change matching rows the owner categorised by hand. */
  includeHandSorted?: boolean;
};
export type RulePreviewParams = { matchText: string; accountId?: number; amountCents?: number; categoryId?: number };

export type SpendingQuery = { month: string; period?: 'statement'; accountId?: number; institution?: string };
export type SpendingSummary = Summary & {
  from: string;
  to: string;
  prevTotalCents: number;
  prevMortgageCents?: number;
  prevCardPaymentCents?: number;
};
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

/** When PocketSmith last received a transaction from this bank (an ISO instant). */
/** Per bank: newest transaction PocketSmith received (`at`), and when it last updated the accounts (`checkedAt`). */
export type BankDataTime = { institution: string; at: string; checkedAt?: string | null };
export type SyncStatus = {
  lastSuccessAt: string | null;
  lastStatus: 'ok' | 'failed' | 'running' | null;
  stale: boolean;
  /** Newest first. Missing from a server older than this field. */
  bankData?: BankDataTime[];
};

export type ImportFormat = 'commbank' | 'amex';
export type ImportBody = { accountId: number; format: ImportFormat; csv: string };
export type ImportedRow = { date: string; amountCents: number; description: string };
export type ImportPreview = { new: ImportedRow[]; duplicates: ImportedRow[]; skipped: { line: number; reason: string }[] };
export type ImportCommit = { inserted: number };

export type LimitLevel = 'ok' | 'warn' | 'over';
/** categoryId null = the whole-month limit. */
export type Limit = {
  id: number;
  categoryId: number | null;
  amountCents: number;
  warnPercent: number;
  spentCents: number;
  percent: number;
  level: LimitLevel;
  alertedAt: string | null;
};
export type NewLimit = { categoryId: number | null; amountCents: number; warnPercent?: number };
export type LimitPatch = { amountCents?: number; warnPercent?: number };

export type EventRepeat = 'none' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';
export type CalendarEventDef = {
  id: number;
  name: string;
  emoji: string;
  amountCents: number | null;
  accountId: number | null;
  startDate: string;
  repeat: EventRepeat;
  leadDays: number;
  onDayAlert: boolean;
};
export type OccurrenceStatus = 'paid' | 'skipped';
export type Occurrence = {
  eventId: number;
  date: string;
  status: OccurrenceStatus | null;
  source: 'auto' | 'user' | null;
  transactionId: number | null;
  payable: boolean;
};
export type OccurrencesResponse = { events: CalendarEventDef[]; occurrences: Occurrence[] };

export type NotificationPrefs = {
  limit: boolean;
  bill: boolean;
  paid_check: boolean;
  sync: boolean;
  stale: boolean;
  trade_hint: boolean;
};

export type ValuedEtfHolding = CoreValuedEtfHolding;
export type DividendSummary = CoreDividendSummary;
export type Trade = ParsedTrade & { id: number; source: 'csv' | 'manual' };
export type CommsecResponse = {
  accountId: number | null;
  valueCents: number;
  costCents: number;
  gainCents: number;
  gainBps: number;
  priceDate: string | null;
  missingPrices: string[];
  /** Held ETFs past the 10 the daily job prices. */
  notUpdated?: string[];
  holdings: ValuedEtfHolding[];
  trades: Trade[];
  /** Dividends and distributions found in bank deposits. Absent before any CommSec import. */
  dividends?: DividendSummary;
};
export type NewTrade = { date: string; side: 'buy' | 'sell'; symbol: string; units: number; price: string; brokerage: string };
export type TradePreview = {
  new: ParsedTrade[];
  have: ParsedTrade[];
  /** CSV trades that will replace hand-entered ones. */
  replacing: number;
  skipped: { line: number; reason: string }[];
  ignored: number;
};
export type TradeImport = { imported: number };

export type NwLine = CoreNwLine;
export type NwRange = CoreNwRange;
export type NetWorthResponse = {
  totalCents: number;
  ownCents: number;
  oweCents: number;
  own: NwLine[];
  owe: NwLine[];
  history: { date: string; totalCents: number }[];
  since: { fromDate: string; deltaCents: number } | null;
};

export type RepaymentFrequency = 'weekly' | 'fortnightly' | 'monthly';
export type ProjectionProfile = {
  birthDate: string | null;
  taxRateBps: number | null;
  mortgageRateBps: number | null;
  repaymentCents: number | null;
  repaymentFrequency: RepaymentFrequency;
  termMonths: number | null;
  offsetGrowthCents: number;
  returnBps: number;
  inflationBps: number;
  distributionYieldBps: number;
  targetCents: number;
  targetAge: number;
  todaysDollars: boolean;
  /** Sydney date the term was last saved (set by the server); the term counts down from it. */
  termSetOn: string | null;
};
export type ProjectionPrefill = {
  etfStartCents: number;
  etfMonthlyCents: number;
  mortgageBalanceCents: number;
  offsetCents: number;
  today: string;
};
export type ProjectionsResponse = { profile: ProjectionProfile; prefill: ProjectionPrefill };
