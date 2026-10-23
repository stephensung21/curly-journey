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
  return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
}
