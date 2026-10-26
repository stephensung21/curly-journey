import { addDays } from '../dates';

/** A bank deposit that might be a dividend or ETF distribution. */
export type DividendCandidate = {
  transactionId: number;
  date: string;
  amountCents: number;
  description: string;
  /** In the Dividends category. */
  inDividends: boolean;
  /** The owner set its category by hand. */
  handSorted: boolean;
};

export type DividendPayment = { transactionId: number; date: string; amountCents: number; symbol: string | null };

export type DividendSummary = {
  last12Cents: number;
  /** Since 1 July (Australian financial year). */
  fyCents: number;
  /** Last 12 months over what was paid for the holdings, in basis points. */
  yieldBps: number;
  /** Newest first. */
  payments: DividendPayment[];
};

const WORDS = /\b(DIV|DIVIDEND|DIVIDENDS|DST|DIST|DISTRIBUTION|DISTRIBUTIONS|DRP)\b/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether a deposit is a dividend, and which held ETF paid it if the description names one. Anything in the
 * Dividends category counts. Otherwise a deposit counts when it names a held ETF or says DIV, DST or DISTRIBUTION,
 * unless the owner sorted it by hand into another category.
 */
export function isDividend(c: DividendCandidate, symbols: string[]): { symbol: string | null } | null {
  if (c.amountCents <= 0) return null;
  const text = c.description.toUpperCase();
  const symbol = symbols.find((s) => new RegExp(`\\b${escape(s.toUpperCase())}\\b`).test(text)) ?? null;
  if (c.inDividends) return { symbol };
  if (c.handSorted) return null;
  return symbol !== null || WORDS.test(text) ? { symbol } : null;
}

/** The 1 July that starts the Australian financial year holding `date`. */
export function financialYearStart(date: string): string {
  const year = Number(date.slice(0, 4));
  return date.slice(5) >= '07-01' ? `${year}-07-01` : `${year - 1}-07-01`;
}

export function dividendSummary(payments: DividendPayment[], today: string, costCents: number): DividendSummary {
  const yearAgo = addDays(today, -365);
  const fy = financialYearStart(today);
  const since = (keep: (date: string) => boolean) => payments.filter((p) => keep(p.date)).reduce((n, p) => n + p.amountCents, 0);
  const last12Cents = since((d) => d > yearAgo);
  return {
    last12Cents,
    fyCents: since((d) => d >= fy),
    yieldBps: costCents > 0 ? Math.round((last12Cents * 10_000) / costCents) : 0,
    payments: [...payments].sort((a, b) => (a.date === b.date ? b.transactionId - a.transactionId : a.date < b.date ? 1 : -1)),
  };
}
