import { parseCsvRecords } from './csv';
import { parseDecimalToCents } from './money';
import { collectRows, parseAuDate, throwIfSkipped, type ImportedRow, type ParsedRows } from './types';

/** Amex export: header row; Amount is positive for charges, so it is negated. Bad rows are skipped. */
export function parseAmexRows(text: string): ParsedRows {
  const [header, ...records] = parseCsvRecords(text);
  if (!header) return { rows: [], skipped: [] };
  const col = (name: string) => {
    const i = header.cells.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
    if (i < 0) throw new RangeError(`Amex CSV is missing column "${name}"`);
    return i;
  };
  const [d, desc, amt] = [col('Date'), col('Description'), col('Amount')];
  const need = Math.max(d, desc, amt) + 1;
  return collectRows(records, (r) => {
    if (r.length < need) throw new RangeError(`Amex row needs at least ${need} columns, got ${r.length}`);
    const cents = parseDecimalToCents(r[amt]!);
    return { date: parseAuDate(r[d]!), amountCents: cents === 0 ? 0 : -cents, description: r[desc]!.trim() };
  });
}

export function parseAmexCsv(text: string): ImportedRow[] {
  return throwIfSkipped(parseAmexRows(text));
}
