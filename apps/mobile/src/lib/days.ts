import { statementPeriod } from '@curly/core';
const TZ = 'Australia/Sydney';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Sydney calendar date (YYYY-MM-DD) of an instant. */
export function sydneyDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

export function plainDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]}`;
}

export function dayBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

export function dayHeader(iso: string, today: string): string {
  if (iso === today) return `Today · ${plainDay(iso)}`;
  if (iso === dayBefore(today)) return `Yesterday · ${plainDay(iso)}`;
  return plainDay(iso);
}

/** `Thu 22 Oct 2026` */
export function fullDay(iso: string): string {
  return `${plainDay(iso)} ${iso.slice(0, 4)}`;
}

/** `22 Oct 2026, 7:41am`: an instant in Sydney time, to the minute. */
export function receivedLabel(iso: string): string {
  const at = new Date(iso);
  const [y, m, d] = sydneyDate(at).split('-').map(Number);
  const time = at
    .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ })
    .replace(/\s/g, '')
    .toLowerCase();
  return `${d} ${MONTHS[m! - 1]} ${y}, ${time}`;
}


/** Statement period for a month, e.g. "26 Sep – 25 Oct". */
export function statementLabel(month: string): string {
  const day = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
  const p = statementPeriod(month);
  return `${day(p.from)} – ${day(p.to)}`;
}
