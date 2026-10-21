import { it, expect } from 'vitest';
import { monthKey, monthBounds, addMonths } from '../src/dates';

it('00:30 AEST on 1 Oct is October', () =>
  expect(monthKey(new Date('2026-09-30T14:30:00Z'))).toBe('2026-10'));

it('23:59 AEST on 30 Sep is September', () =>
  expect(monthKey(new Date('2026-09-30T13:59:00Z'))).toBe('2026-09'));

it('October bounds span the DST start (AEST to AEDT)', () => {
  const { start, end } = monthBounds('2026-10');
  expect(start.toISOString()).toBe('2026-09-30T14:00:00.000Z');
  expect(end.toISOString()).toBe('2026-10-31T13:00:00.000Z');
});

it('April bounds span the DST end', () => {
  const { start, end } = monthBounds('2026-04');
  expect(start.toISOString()).toBe('2026-03-31T13:00:00.000Z');
  expect(end.toISOString()).toBe('2026-04-30T14:00:00.000Z');
});

it('addMonths wraps the year', () => {
  expect(addMonths('2026-11', 2)).toBe('2027-01');
  expect(addMonths('2026-01', -1)).toBe('2025-12');
});

it('rejects malformed keys', () => expect(() => monthBounds('2026-13')).toThrow());
