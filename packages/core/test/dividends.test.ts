import { describe, expect, it } from 'vitest';
import { dividendSummary, financialYearStart, isDividend, type DividendCandidate } from '../src/holdings/dividends';

const held = ['VDHG', 'VGS', 'VAS'];
const cand = (o: Partial<DividendCandidate>): DividendCandidate => ({
  transactionId: 1, date: '2026-10-15', amountCents: 12_345, description: '', inDividends: false, handSorted: false, ...o,
});

describe('isDividend', () => {
  it('spots a deposit naming a held ETF or saying it is a distribution', () => {
    expect(isDividend(cand({ description: 'Direct Credit 123 VGS DST 001284' }), held)).toEqual({ symbol: 'VGS' });
    expect(isDividend(cand({ description: 'VANGUARD DISTRIBUTION' }), held)).toEqual({ symbol: null });
    expect(isDividend(cand({ description: 'BHP GROUP DIV 001' }), held)).toEqual({ symbol: null });
  });

  it('ignores debits, look-alike words and rows sorted by hand into something else', () => {
    expect(isDividend(cand({ description: 'VGS DST', amountCents: -500 }), held)).toBeNull();
    expect(isDividend(cand({ description: 'DIVERSE CAFE refund' }), held)).toBeNull();
    expect(isDividend(cand({ description: 'Salary CANVAS PTY' }), held)).toBeNull();
    expect(isDividend(cand({ description: 'VGS DST', handSorted: true }), held)).toBeNull();
  });

  it('counts anything put in the Dividends category, naming the ETF when it can', () => {
    expect(isDividend(cand({ description: 'Transfer from Mum', inDividends: true, handSorted: true }), held)).toEqual({ symbol: null });
    expect(isDividend(cand({ description: 'VAS PAYMENT', inDividends: true }), held)).toEqual({ symbol: 'VAS' });
  });
});

describe('financialYearStart', () => {
  it('is the 1 July on or before the date', () => {
    expect(financialYearStart('2026-10-26')).toBe('2026-07-01');
    expect(financialYearStart('2026-07-01')).toBe('2026-07-01');
    expect(financialYearStart('2026-06-30')).toBe('2025-07-01');
  });
});

describe('dividendSummary', () => {
  it('totals the last 12 months and this financial year, with yield on cost, newest first', () => {
    const pays = [
      { transactionId: 1, date: '2025-10-20', amountCents: 10_000, symbol: 'VGS' }, // older than 12 months
      { transactionId: 2, date: '2026-01-15', amountCents: 20_000, symbol: 'VAS' },
      { transactionId: 3, date: '2026-07-16', amountCents: 30_000, symbol: null },
    ];
    expect(dividendSummary(pays, '2026-10-26', 1_000_000)).toEqual({
      last12Cents: 50_000,
      fyCents: 30_000,
      yieldBps: 500,
      payments: [pays[2], pays[1], pays[0]],
    });
  });

  it('has no yield without a cost', () => {
    expect(dividendSummary([], '2026-10-26', 0)).toEqual({ last12Cents: 0, fyCents: 0, yieldBps: 0, payments: [] });
  });
});
