import { describe, it, expect } from 'vitest';
import { holdingsFromTrades, valueHoldings, avgMonthlyInvestmentCents } from '../src/index';

const t = (date: string, side: 'buy' | 'sell', units: number, totalCents: number, symbol = 'VAS') => ({ date, side, symbol, units, totalCents });

describe('holdingsFromTrades', () => {
  it('averages cost across buys', () => {
    expect(holdingsFromTrades([t('2026-01-01', 'buy', 10, 100000), t('2026-02-01', 'buy', 10, 120000)])).toEqual([
      { symbol: 'VAS', units: 20, costCents: 220000 },
    ]);
  });
  it('removes cost proportionally on a sell', () => {
    const h = holdingsFromTrades([t('2026-01-01', 'buy', 10, 100000), t('2026-02-01', 'buy', 10, 120000), t('2026-03-01', 'sell', 5, 70000)]);
    expect(h).toEqual([{ symbol: 'VAS', units: 15, costCents: 165000 }]);
  });
  it('drops over-sold holdings without throwing', () => {
    expect(holdingsFromTrades([t('2026-01-01', 'buy', 20, 100000), t('2026-02-01', 'sell', 30, 150000)])).toEqual([]);
  });
  it('applies buys before sells on the same date', () => {
    expect(holdingsFromTrades([t('2026-01-01', 'sell', 5, 1), t('2026-01-01', 'buy', 10, 100000)])).toEqual([
      { symbol: 'VAS', units: 5, costCents: 50000 },
    ]);
  });
  it('sorts by symbol', () => {
    const h = holdingsFromTrades([t('2026-01-01', 'buy', 1, 100, 'VGS'), t('2026-01-01', 'buy', 1, 100, 'A200')]);
    expect(h.map((x) => x.symbol)).toEqual(['A200', 'VGS']);
  });
});

describe('valueHoldings', () => {
  const h = [{ symbol: 'VAS', units: 15, costCents: 15000 }];
  it('values at close', () => {
    const [v] = valueHoldings(h, new Map([['VAS', { closeMicros: 12_000_000, date: '2026-10-23' }]]));
    expect(v).toMatchObject({ valueCents: 18000, avgCostMicros: 10_000_000, gainCents: 3000, gainBps: 2000, closeMicros: 12_000_000, priceDate: '2026-10-23' });
  });
  it('falls back to cost with no close', () => {
    const [v] = valueHoldings(h, new Map());
    expect(v).toMatchObject({ valueCents: 15000, gainCents: 0, gainBps: 0, closeMicros: null, priceDate: null });
  });
  it('rounds bps to the basis point', () => {
    const [v] = valueHoldings([{ symbol: 'X', units: 3, costCents: 30000 }], new Map([['X', { closeMicros: 100_010_000, date: 'd' }]]));
    expect(v!.valueCents).toBe(30003);
    expect(v!.gainBps).toBe(1);
  });
});

describe('avgMonthlyInvestmentCents', () => {
  it('nets buys and sells in the last 12 months', () => {
    const trades = [t('2026-09-01', 'buy', 1, 120000), t('2026-08-01', 'sell', 1, 24000), t('2025-09-01', 'buy', 1, 999999)];
    expect(avgMonthlyInvestmentCents(trades, '2026-10-24')).toBe(8000);
  });
});
