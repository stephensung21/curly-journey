import { describe, it, expect } from 'vitest';
import { occurrences, isOccurrence, isPayable, REPEAT_LABEL, type CalendarEvent } from '../src/calendar/events';
import { matchPayments, type PaymentCandidate } from '../src/calendar/match';

const ev = (o: Partial<CalendarEvent>): CalendarEvent => ({
  id: 1, name: 'Thing', emoji: 'x', amountCents: null, accountId: null,
  startDate: '2026-01-01', repeat: 'none', leadDays: 1, onDayAlert: true, ...o,
});

describe('occurrences', () => {
  it('monthly from the 31st', () =>
    expect(occurrences(ev({ startDate: '2026-01-31', repeat: 'monthly' }), '2026-01-01', '2026-05-31'))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']));
  it('yearly from leap day', () =>
    expect(occurrences(ev({ startDate: '2024-02-29', repeat: 'yearly' }), '2024-01-01', '2028-12-31'))
      .toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']));
  it('fortnightly', () =>
    expect(occurrences(ev({ startDate: '2026-10-02', repeat: 'fortnightly' }), '2026-10-01', '2026-10-31'))
      .toEqual(['2026-10-02', '2026-10-16', '2026-10-30']));
  it('weekly', () =>
    expect(occurrences(ev({ startDate: '2026-10-02', repeat: 'weekly' }), '2026-10-05', '2026-10-20'))
      .toEqual(['2026-10-09', '2026-10-16']));
  it('quarterly', () =>
    expect(occurrences(ev({ startDate: '2026-10-28', repeat: 'quarterly' }), '2026-10-01', '2027-04-30'))
      .toEqual(['2026-10-28', '2027-01-28', '2027-04-28']));
  it('none occurs once', () => {
    const e = ev({ startDate: '2026-10-10' });
    expect(occurrences(e, '2026-10-01', '2026-10-31')).toEqual(['2026-10-10']);
    expect(occurrences(e, '2026-11-01', '2026-11-30')).toEqual([]);
  });
  it('window before start is empty', () =>
    expect(occurrences(ev({ startDate: '2026-10-10', repeat: 'weekly' }), '2026-01-01', '2026-10-09')).toEqual([]));
  it('isOccurrence', () => {
    const e = ev({ startDate: '2026-10-28', repeat: 'quarterly' });
    expect(isOccurrence(e, '2027-01-28')).toBe(true);
    expect(isOccurrence(e, '2026-11-28')).toBe(false);
  });
  it('isPayable', () => {
    expect(isPayable({ amountCents: null, accountId: null })).toBe(false);
    expect(isPayable({ amountCents: 100, accountId: null })).toBe(true);
    expect(isPayable({ amountCents: null, accountId: 3 })).toBe(true);
  });
  it('labels', () => expect(REPEAT_LABEL.none).toBe('once'));
});

describe('matchPayments', () => {
  const internet = ev({ id: 1, name: 'Internet', amountCents: 8900, accountId: null });
  const netflix = ev({ id: 2, name: 'Netflix', amountCents: null, accountId: 5 });
  const events = new Map([[1, internet], [2, netflix]]);
  const tx = (o: Partial<PaymentCandidate>): PaymentCandidate => ({
    id: 10, accountId: 1, date: '2026-10-12', amountCents: -8950, merchant: 'Acme', description: 'x', ...o,
  });
  const due1 = [{ eventId: 1, date: '2026-10-10' }];
  const run = (due = due1, txns: PaymentCandidate[] = [], taken = new Set<number>()) =>
    matchPayments(due, events, txns, taken);

  it('amount within 5%', () => expect(run(due1, [tx({})]).get('1:2026-10-10')).toBe(10));
  it('amount outside tolerance', () => expect(run(due1, [tx({ amountCents: -9500 })]).size).toBe(0));
  it('name match needs the account', () => {
    const d = [{ eventId: 2, date: '2026-10-10' }];
    const n = tx({ id: 20, accountId: 5, amountCents: -1599, merchant: 'NETFLIX.COM' });
    expect(run(d, [n]).get('2:2026-10-10')).toBe(20);
    expect(run(d, [{ ...n, accountId: 6 }]).size).toBe(0);
  });
  it('credits never match', () => expect(run(due1, [tx({ amountCents: 8900 })]).size).toBe(0));
  it('4 days away no match', () => expect(run(due1, [tx({ date: '2026-10-14' })]).size).toBe(0));
  it('3 days away matches', () => expect(run(due1, [tx({ date: '2026-10-07' })]).size).toBe(1));
  it('closer date wins, then lower id', () => {
    expect(run(due1, [tx({ id: 1, date: '2026-10-13' }), tx({ id: 2, date: '2026-10-11' })]).get('1:2026-10-10')).toBe(2);
    expect(run(due1, [tx({ id: 7 }), tx({ id: 6 })]).get('1:2026-10-10')).toBe(6);
  });
  it('amount+name beats closer amount-only', () => {
    const both = tx({ id: 5, date: '2026-10-13', merchant: 'Internet Co' });
    const closer = tx({ id: 4, date: '2026-10-10' });
    expect(run(due1, [closer, both]).get('1:2026-10-10')).toBe(5);
  });
  it('one txn only once', () => {
    const d = [{ eventId: 1, date: '2026-10-10' }, { eventId: 1, date: '2026-10-11' }];
    const m = run(d, [tx({})]);
    expect(m.size).toBe(1);
    expect(m.get('1:2026-10-10')).toBe(10);
  });
  it('taken skipped', () => expect(run(due1, [tx({})], new Set([10])).size).toBe(0));
  it('non-payable never matches', () => {
    const e = ev({ id: 3, name: 'Statement' });
    const m = matchPayments([{ eventId: 3, date: '2026-10-10' }], new Map([[3, e]]), [tx({ merchant: 'Statement' })], new Set());
    expect(m.size).toBe(0);
  });
});
