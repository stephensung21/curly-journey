import type { Cents } from '../money';

export type AccountKind = 'transaction' | 'savings' | 'credit_card' | 'mortgage' | 'brokerage' | 'manual_asset';
export type ProjectionsRole = 'off' | 'etf' | 'mortgage';
export type Counts = { countsSpending: boolean; countsNetWorth: boolean; projections: ProjectionsRole };

export type PsTransactionAccount = {
  id: number;
  name: string;
  number: string | null;
  type: string;
  currency_code: string;
  current_balance: number;
  current_balance_date: string;
  institution: { id: number; title: string };
};

export type PsTransaction = {
  id: number;
  payee: string;
  original_payee: string | null;
  date: string;
  amount: number;
  status: 'posted' | 'pending';
  updated_at: string;
  transaction_account: { id: number };
};

export type AccountRow = {
  source: 'pocketsmith';
  externalId: string;
  institution: string;
  name: string;
  kind: AccountKind;
  balanceCents: Cents;
  balanceDate: string;
};

export type TransactionRow = {
  source: 'pocketsmith';
  externalId: string;
  accountExternalId: string;
  date: string;
  amountCents: Cents;
  descriptionRaw: string;
  payee: string;
  status: 'posted' | 'pending';
};

function toCents(amount: number): Cents {
  const c = Math.round(amount * 100);
  return c === 0 ? 0 : c; // avoid -0
}

export function kindFromPocketSmithType(type: string, name: string): AccountKind {
  switch (type) {
    case 'bank':
      return /saver|savings/i.test(name) ? 'savings' : 'transaction';
    case 'credits':
      return 'credit_card';
    case 'loans':
    case 'mortgage':
      return 'mortgage';
    case 'stocks':
      return 'brokerage';
    default:
      return 'manual_asset'; // property, vehicle, other_asset, unknown
  }
}

export function defaultCounts(kind: AccountKind): Counts {
  switch (kind) {
    case 'mortgage':
      return { countsSpending: false, countsNetWorth: true, projections: 'mortgage' };
    case 'brokerage':
      return { countsSpending: false, countsNetWorth: true, projections: 'etf' };
    case 'manual_asset':
      return { countsSpending: false, countsNetWorth: true, projections: 'off' };
    default:
      return { countsSpending: true, countsNetWorth: true, projections: 'off' };
  }
}

export function mapAccount(a: PsTransactionAccount): AccountRow {
  return {
    source: 'pocketsmith',
    externalId: String(a.id),
    institution: a.institution.title,
    name: a.name,
    kind: kindFromPocketSmithType(a.type, a.name),
    balanceCents: toCents(a.current_balance),
    balanceDate: a.current_balance_date,
  };
}

export function mapTransaction(t: PsTransaction): TransactionRow {
  return {
    source: 'pocketsmith',
    externalId: String(t.id),
    accountExternalId: String(t.transaction_account.id),
    date: t.date,
    amountCents: toCents(t.amount),
    descriptionRaw: t.original_payee ?? t.payee,
    payee: t.payee,
    status: t.status,
  };
}
