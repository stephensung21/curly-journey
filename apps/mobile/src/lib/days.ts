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
