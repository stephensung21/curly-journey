export type CsvRecord = { line: number; cells: string[] };

/**
 * Minimal RFC 4180 parser: strips BOM, handles quoted commas/quotes/newlines, drops blank lines.
 * `line` is the 1-based physical line where the record starts; blank lines and quoted newlines advance it.
 */
export function parseCsvRecords(text: string): CsvRecord[] {
  const src = text.replace(/^﻿/, '');
  const records: CsvRecord[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let startLine = 1;
  let started = false;

  const endRow = () => {
    row.push(field);
    field = '';
    if (row.some((f) => f.trim() !== '')) records.push({ line: startLine, cells: row });
    row = [];
    started = false;
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (!started) {
      started = true;
      startLine = line;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      line++;
      if (quoted) field += ch === '\r' && src[i] === '\n' ? '\r\n' : ch;
      else endRow();
    } else if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) endRow();
  return records;
}

export function parseCsv(text: string): string[][] {
  return parseCsvRecords(text).map((r) => r.cells);
}
