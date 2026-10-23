import { it, expect } from 'vitest';
import { sydneyDate, sydneyHour, addDays, daysBetween, minusMonths, dayLabel, dayMonthLabel } from '../src/dates';

it('sydneyDate rolls past midnight', () =>
  expect(sydneyDate(new Date('2026-10-03T14:30:00Z'))).toBe('2026-10-04'));
it('sydneyHour in AEDT', () =>
  expect(sydneyHour(new Date('2026-10-03T23:00:00Z'))).toBe(10));
it('sydneyHour in AEST', () =>
  expect(sydneyHour(new Date('2027-04-04T00:00:00Z'))).toBe(10));
it('addDays crosses month', () => expect(addDays('2026-02-27', 2)).toBe('2026-03-01'));
it('daysBetween is b - a', () => {
  expect(daysBetween('2026-10-25', '2026-10-28')).toBe(3);
  expect(daysBetween('2026-10-28', '2026-10-25')).toBe(-3);
});
it('minusMonths clamps day', () => expect(minusMonths('2026-05-31', 3)).toBe('2026-02-28'));
it('dayLabel', () => expect(dayLabel('2026-10-27')).toBe('Tue 27 Oct'));
it('dayMonthLabel', () => expect(dayMonthLabel('2026-07-24')).toBe('24 Jul'));
