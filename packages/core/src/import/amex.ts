import { parseCsv } from './csv';
import { parseDecimalToCents } from './money';
import { parseAuDate, type ImportedRow } from './types';

/** Amex export: header row; Amount is positive for charges, so it is negated. */
export function parseAmexCsv(text: string): ImportedRow[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const col = (name: string) => {
    const i = header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
    if (i < 0) throw new RangeError(`Amex CSV is missing column "${name}"`);
    return i;
  };
  const [d, desc, amt] = [col('Date'), col('Description'), col('Amount')];
  return rows.map((r) => {
    const cents = parseDecimalToCents(r[amt]!);
    return { date: parseAuDate(r[d]!), amountCents: cents === 0 ? 0 : -cents, description: r[desc]!.trim() };
  });
}
