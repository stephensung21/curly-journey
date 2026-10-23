import { describe, it, expect } from 'vitest';
import { limitStatuses, limitMessage, isManualStale } from '../src/index';

const summary = (totalCents: number, byCategory: { categoryId: number | null; cents: number; count: number }[] = []) => ({
  totalCents,
  byCategory,
});

describe('limitStatuses', () => {
  it('whole-month limit uses total', () => {
    const [s] = limitStatuses([{ id: 1, categoryId: null, amountCents: 600000, warnPercent: 80 }], summary(496000));
    expect(s).toMatchObject({ spentCents: 496000, percent: 82, level: 'warn' });
  });
  it('category limit uses category spend', () => {
    const [s] = limitStatuses(
      [{ id: 2, categoryId: 7, amountCents: 95000, warnPercent: 80 }],
      summary(0, [{ categoryId: 7, cents: 87400, count: 5 }]),
    );
    expect(s).toMatchObject({ percent: 92, level: 'warn' });
  });
  it('100% is over', () => {
    const [s] = limitStatuses([{ id: 1, categoryId: null, amountCents: 100000, warnPercent: 80 }], summary(100000));
    expect(s).toMatchObject({ percent: 100, level: 'over' });
  });
  it('refunds give 0 / ok', () => {
    const [s] = limitStatuses([{ id: 1, categoryId: null, amountCents: 100000, warnPercent: 80 }], summary(-500));
    expect(s).toMatchObject({ percent: 0, level: 'ok' });
  });
  it('category with no spend is 0', () => {
    const [s] = limitStatuses([{ id: 2, categoryId: 9, amountCents: 5000, warnPercent: 80 }], summary(100));
    expect(s!.spentCents).toBe(0);
    expect(s!.level).toBe('ok');
  });
  it('floors the percent', () => {
    const [s] = limitStatuses([{ id: 1, categoryId: null, amountCents: 1000, warnPercent: 99 }], summary(999));
    expect(s).toMatchObject({ percent: 99, level: 'warn' });
  });
});

describe('limitMessage', () => {
  it('formats', () => expect(limitMessage('Dining out', 92)).toBe('Dining out is at 92% of your limit'));
});

describe('isManualStale', () => {
  it('3 months old is stale', () => expect(isManualStale('2026-07-24', '2026-10-24')).toBe(true));
  it('one day newer is fresh', () => expect(isManualStale('2026-07-25', '2026-10-24')).toBe(false));
  it('null is stale', () => expect(isManualStale(null, '2026-10-24')).toBe(true));
});
