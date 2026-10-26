import { describe, expect, it } from 'vitest';
import { historyDates, netWorthHistory, type HistoryInput, type NwAccount } from '../src/index';

const acct = (o: Partial<NwAccount> = {}): NwAccount => ({
  id: 1, name: 'Everyday', kind: 'transaction', balanceCents: 100_000, balanceDate: '2026-10-24',
  source: 'pocketsmith', isOffset: false, countsNetWorth: true, growthBps: null, ...o,
});
const today = '2026-10-24';
const input = (o: Partial<HistoryInput> = {}): HistoryInput => ({
  accounts: [], flows: [], trades: [], commsecAccountId: null, closeAt: () => null, ...o,
});
const buy = (date: string, symbol: string, units: number, priceMicros: number) => ({
  date, side: 'buy' as const, symbol, units, priceMicros, totalCents: Math.round((units * priceMicros) / 10_000),
});

describe('historyDates', () => {
  it('1M: the range start, then weekly, today excluded', () => {
    expect(historyDates('1M', today, null)).toEqual(['2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22']);
  });
  it('6M: the range start, then each month end before today', () => {
    expect(historyDates('6M', today, null)).toEqual([
      '2026-04-24', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30',
    ]);
  });
  it('All: month ends from the earliest data', () => {
    expect(historyDates('All', today, '2026-07-10')).toEqual(['2026-07-10', '2026-07-31', '2026-08-31', '2026-09-30']);
  });
  it('All with no data: no past points', () => {
    expect(historyDates('All', today, null)).toEqual([]);
  });
  it('a range start after the earliest data is not moved', () => {
    expect(historyDates('6M', today, '2026-09-15')[0]).toBe('2026-04-24');
  });
});

describe('netWorthHistory', () => {
  it('winds bank balances back by the transactions after each date', () => {
    const r = netWorthHistory(
      input({
        accounts: [acct()],
        flows: [
          { accountId: 1, date: '2026-09-15', amountCents: 30_000 },
          { accountId: 1, date: '2026-10-05', amountCents: -10_000 },
        ],
      }),
      ['2026-09-01', '2026-09-30', '2026-10-05'],
    );
    // Sep 1: 100k - 30k + 10k. Sep 30: 100k + 10k. Oct 5: the 5 Oct debit has already happened.
    expect(r).toEqual([
      { date: '2026-09-01', totalCents: 80_000 },
      { date: '2026-09-30', totalCents: 110_000 },
      { date: '2026-10-05', totalCents: 100_000 },
    ]);
  });

  it('ignores transactions dated after the balance date', () => {
    const r = netWorthHistory(
      input({ accounts: [acct({ balanceDate: '2026-10-01' })], flows: [{ accountId: 1, date: '2026-10-03', amountCents: 5_000 }] }),
      ['2026-09-30'],
    );
    expect(r[0]!.totalCents).toBe(100_000);
  });

  it('values CommSec from units held then and the close then, falling back to the last trade price', () => {
    const commsec = acct({ id: 9, source: 'commsec', balanceCents: 999_999 });
    const closes: Record<string, number> = { 'VAS|2026-09-30': 110_000_000 };
    const r = netWorthHistory(
      input({
        accounts: [commsec],
        commsecAccountId: 9,
        trades: [buy('2026-08-10', 'VAS', 10, 100_000_000), buy('2026-10-02', 'VAS', 5, 120_000_000)],
        closeAt: (s, d) => closes[`${s}|${d}`] ?? null,
      }),
      ['2026-07-31', '2026-08-31', '2026-09-30', '2026-10-05'],
    );
    expect(r.map((p) => p.totalCents)).toEqual([
      0, // nothing held yet
      100_000, // 10 x $100, no close: last trade price
      110_000, // 10 x $110 close
      180_000, // 15 x $120, last trade price
    ]);
  });

  it('runs manual growth backwards from the as-of date, and holds a manual value with no growth', () => {
    const r = netWorthHistory(
      input({
        accounts: [
          acct({ id: 2, source: 'manual', balanceCents: 1_100_000, balanceDate: '2026-10-24', growthBps: 1000 }),
          acct({ id: 3, source: 'manual', balanceCents: 50_000, balanceDate: '2026-01-01' }),
        ],
      }),
      ['2025-10-24'],
    );
    expect(r[0]!.totalCents).toBe(50_000 + Math.round(1_100_000 * Math.pow(1.1, -365 / 365.25)));
  });

  it('keeps accounts with no transactions (CoinSpot) at their balance', () => {
    const r = netWorthHistory(input({ accounts: [acct({ source: 'coinspot', balanceCents: 7_000 })] }), ['2026-01-31']);
    expect(r[0]!.totalCents).toBe(7_000);
  });

  it('adds loans: a mortgage that was bigger before repayments', () => {
    const r = netWorthHistory(
      input({
        accounts: [acct(), acct({ id: 4, kind: 'mortgage', balanceCents: -500_000 })],
        flows: [{ accountId: 4, date: '2026-10-10', amountCents: 20_000 }],
      }),
      ['2026-09-30'],
    );
    expect(r[0]!.totalCents).toBe(100_000 - 520_000);
  });
});
