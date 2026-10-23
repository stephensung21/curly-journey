import { fullDay, receivedLabel } from '../src/lib/days';

it('formats a full date with weekday and year', () => {
  expect(fullDay('2026-10-22')).toBe('Thu 22 Oct 2026');
  expect(fullDay('2026-01-05')).toBe('Mon 5 Jan 2026');
});

it('formats a received instant in Sydney time with lowercase am/pm', () => {
  expect(receivedLabel('2026-10-21T20:41:00Z')).toBe('22 Oct 2026, 7:41am');
  expect(receivedLabel('2026-10-22T04:05:00Z')).toBe('22 Oct 2026, 3:05pm');
});

it('uses the Sydney date when UTC is still the day before', () => {
  expect(receivedLabel('2026-12-31T14:30:00Z')).toBe('1 Jan 2027, 1:30am');
});
