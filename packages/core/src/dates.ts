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

/** The Sydney calendar day ("YYYY-MM-DD") an instant falls in. */
export function sydneyDate(d: Date): string {
  const l = new TZDate(d.getTime(), TZ);
  return `${toKey(l.getFullYear(), l.getMonth() + 1)}-${String(l.getDate()).padStart(2, '0')}`;
}

/** The Sydney hour (0-23) of an instant. */
export function sydneyHour(d: Date): number {
  return new TZDate(d.getTime(), TZ).getHours();
}

const DAY_MS = 86_400_000;

function parseIso(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError(`Invalid date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromMs(ms: number): string {
  const d = new Date(ms);
  return `${toKey(d.getUTCFullYear(), d.getUTCMonth() + 1)}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, n: number): string {
  return fromMs(parseIso(iso) + n * DAY_MS);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b) - parseIso(a)) / DAY_MS);
}

/** Shift a date by n calendar months, clamping the day to the target month's end. */
export function shiftMonths(iso: string, n: number): string {
  const day = Number(iso.slice(8, 10));
  const target = addMonths(iso.slice(0, 7), n);
  const last = new Date(Date.UTC(Number(target.slice(0, 4)), Number(target.slice(5, 7)), 0)).getUTCDate();
  return `${target}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export function minusMonths(iso: string, n: number): string {
  return shiftMonths(iso, -n);
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** e.g. "Tue 27 Oct". */
export function dayLabel(iso: string): string {
  const d = new Date(parseIso(iso));
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** e.g. "27 Jul". */
export function dayMonthLabel(iso: string): string {
  const d = new Date(parseIso(iso));
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}
