import type { ImportedRow } from './types';

export function normaliseDescription(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const dayNumber = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000;

export function isLikelyDuplicate(a: ImportedRow, b: ImportedRow): boolean {
  return (
    a.amountCents === b.amountCents &&
    Math.abs(dayNumber(a.date) - dayNumber(b.date)) <= 2 &&
    normaliseDescription(a.description).slice(0, 8) === normaliseDescription(b.description).slice(0, 8)
  );
}

/** Stable per-row keys; n is the occurrence index of the same date/amount/description within the file. */
export function rowFingerprints(rows: ImportedRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${r.date}|${r.amountCents}|${normaliseDescription(r.description)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}|${n}`;
  });
}
