import { describe, expect, it } from 'vitest';
import { inOutByMonth, monthPeriod, runningByDay, statementPeriod, summarise, type Flow, type SpendLine } from '../../src';

const L = (
  txnId: number,
  amountCents: number,
  categoryId: number | null,
  categoryKind: 'spending' | 'income' | null,
  flow: Flow = 'normal',
  institution = 'American Express',
  date = '2026-10-05',
): SpendLine => ({ txnId, accountId: 1, institution, date, amountCents, categoryId, categoryKind, flow });

describe('summarise money out and in', () => {
  const s = summarise([
    L(1, -10000, 5, 'spending'),
    L(2, -5000, null, null),
    L(3, 4000, 5, 'spending'),
    L(4, 500000, 21, 'income'),
    L(5, -310000, null, null, 'mortgage'),
    { ...L(6, -80000, null, null, 'transfer'), cardPayment: true },
    L(7, -20000, null, null, 'transfer'),
  ]);
  it('splits the total into money out and money back, so out minus in is the total', () => {
    expect(s.outCents).toBe(15000);
    expect(s.backCents).toBe(4000);
    expect(s.totalCents).toBe(s.outCents - s.backCents);
  });
  it('totals card payments separately from other transfers', () => {
    expect(s.cardPaymentCents).toBe(80000);
    expect(s.mortgageCents).toBe(310000);
  });
});

describe('periods', () => {
  it('computes month and statement periods', () => {
    expect(monthPeriod('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(statementPeriod('2026-12')).toEqual({ from: '2026-11-26', to: '2026-12-25' });
    expect(statementPeriod('2027-01')).toEqual({ from: '2026-12-26', to: '2027-01-25' });
  });
});

describe('summarise', () => {
  const s = summarise([
    L(1, -10000, 5, 'spending'),
    L(2, 4000, 5, 'spending'),
    L(3, 253000, null, null, 'transfer'),
    L(4, 500000, 21, 'income', 'normal', 'Commonwealth Bank'),
    L(5, -310000, null, null, 'mortgage', 'Commonwealth Bank'),
    L(6, -2000, null, null),
  ]);
  it('applies definitions', () => {
    expect(s.totalCents).toBe(8000);
    expect(s.byCategory[0]).toEqual({ categoryId: 5, cents: 6000, count: 2 });
    expect(s.moneyInCents).toBe(500000);
    expect(s.mortgageCents).toBe(310000);
    expect(s.uncategorisedCount).toBe(1);
    expect(s.byInstitution).toEqual([{ institution: 'Amex', cents: 8000 }]);
  });
  it('lists not-counted outflows, omitting empty flows', () => {
    expect(s.notCounted).toEqual([{ flow: 'mortgage', cents: 310000, count: 1 }]);
  });
  it('keeps split lines separate', () => {
    expect(summarise([L(9, -6000, 1, 'spending'), L(9, -4000, 5, 'spending')]).byCategory).toHaveLength(2);
  });
});

describe('inOutByMonth', () => {
  it('buckets by month', () => {
    const r = inOutByMonth(
      [
        L(1, -1000, 5, 'spending', 'normal', 'Up', '2026-09-30'),
        L(2, 9000, 21, 'income', 'normal', 'Up', '2026-10-01'),
        L(3, -4000, null, null, 'mortgage', 'Up', '2026-10-02'),
      ],
      ['2026-09', '2026-10', '2026-11'],
    );
    expect(r).toEqual([
      { month: '2026-09', inCents: 0, mortgageCents: 0, spendingCents: 1000 },
      { month: '2026-10', inCents: 9000, mortgageCents: 4000, spendingCents: 0 },
      { month: '2026-11', inCents: 0, mortgageCents: 0, spendingCents: 0 },
    ]);
  });
});

describe('runningByDay', () => {
  const lines = [L(1, -1000, 5, 'spending', 'normal', 'Up', '2026-10-03')];
  it('stops at today in the current month', () => {
    expect(runningByDay(lines, '2026-10', '2026-10-05').map((r) => r.spendingCents)).toEqual([0, 0, 1000, 1000, 1000]);
  });
  it('covers the whole past month', () => {
    expect(runningByDay(lines, '2026-10', '2026-11-02')).toHaveLength(31);
  });
  it('is empty for a future month', () => {
    expect(runningByDay(lines, '2026-12', '2026-11-02')).toEqual([]);
  });
});
