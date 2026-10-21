import { TZDate } from '@date-fns/tz';

/** All months in the app are calendar months in Sydney time. */
export const TZ = 'Australia/Sydney';

const KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

function parseKey(key: string): { year: number; month: number } {
  const m = KEY.exec(key);
  if (!m) throw new RangeError(`Invalid month key: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

function toKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** The Sydney calendar month ("YYYY-MM") an instant falls in. */
export function monthKey(instant: Date): string {
  const local = new TZDate(instant.getTime(), TZ);
  return toKey(local.getFullYear(), local.getMonth() + 1);
}

/** Start (inclusive) and end (exclusive) instants of a Sydney calendar month. */
export function monthBounds(key: string): { start: Date; end: Date } {
  const { year, month } = parseKey(key);
  const start = new TZDate(year, month - 1, 1, TZ);
  const end = new TZDate(year, month, 1, TZ);
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

export function addMonths(key: string, n: number): string {
  const { year, month } = parseKey(key);
  const index = year * 12 + (month - 1) + n;
  return toKey(Math.floor(index / 12), (index % 12 + 12) % 12 + 1);
}
