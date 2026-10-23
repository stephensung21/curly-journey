import { parseCsv } from './csv';
import { parseDecimalToCents } from './money';
import { parseAuDate, type ImportedRow } from './types';

/** CommBank export: no header; date(dd/mm/yyyy), amount, description, balance. */
export function parseCommBankCsv(text: string): ImportedRow[] {
  return parseCsv(text).map((r) => {
    if (r.length < 3) throw new RangeError(`CommBank row needs at least 3 columns, got ${r.length}`);
    return { date: parseAuDate(r[0]!), amountCents: parseDecimalToCents(r[1]!), description: r[2]!.trim() };
  });
}
