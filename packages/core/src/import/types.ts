import type { Cents } from '../money';

export type ImportedRow = {
  /** YYYY-MM-DD */
  date: string;
  /** Negative = money out. */
  amountCents: Cents;
  description: string;
};

/** dd/mm/yyyy -> yyyy-mm-dd */
export function parseAuDate(s: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) throw new RangeError(`Not a dd/mm/yyyy date: ${JSON.stringify(s)}`);
  const [y, mo, d] = [Number(m[3]), Number(m[2]), Number(m[1])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (mo < 1 || mo > 12 || t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) {
    throw new RangeError(`Not a real date: ${JSON.stringify(s)}`);
  }
  return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
}

export type SkippedRow = { line: number; reason: string };
export type ParsedRows = { rows: ImportedRow[]; skipped: SkippedRow[] };

/** Collect rows from records, turning per-row RangeErrors into skipped entries. */
export function collectRows(records: { line: number; cells: string[] }[], parse: (cells: string[]) => ImportedRow): ParsedRows {
  const rows: ImportedRow[] = [];
  const skipped: SkippedRow[] = [];
  for (const { line, cells } of records) {
    try {
      rows.push(parse(cells));
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      skipped.push({ line, reason: e.message });
    }
  }
  return { rows, skipped };
}

/** Throwing wrapper over a *Rows parser: first skipped row becomes a RangeError. */
export function throwIfSkipped({ rows, skipped }: ParsedRows): ImportedRow[] {
  if (skipped[0]) throw new RangeError(`Line ${skipped[0].line}: ${skipped[0].reason}`);
  return rows;
}
