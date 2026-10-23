import { parseCsvRecords } from './csv';
import { parseDecimalToCents } from './money';
import { collectRows, parseAuDate, throwIfSkipped, type ImportedRow, type ParsedRows } from './types';

/** CommBank export: no header; date(dd/mm/yyyy), amount, description, balance. Bad rows are skipped. */
export function parseCommBankRows(text: string): ParsedRows {
  return collectRows(parseCsvRecords(text), (r) => {
    if (r.length < 3) throw new RangeError(`CommBank row needs at least 3 columns, got ${r.length}`);
    return { date: parseAuDate(r[0]!), amountCents: parseDecimalToCents(r[1]!), description: r[2]!.trim() };
  });
}

export function parseCommBankCsv(text: string): ImportedRow[] {
  return throwIfSkipped(parseCommBankRows(text));
}
