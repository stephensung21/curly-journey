// Prints the SHAPE of a CommSec transactions CSV: header row, row count, and
// each distinct Details shape with a count. No amounts, no names, no Reference
// values. Safe to paste into chat. Imports nothing from the repo.
// Usage: node scripts/commsec-shape.mjs <path-to-csv>
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function splitCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Keep the first word; digits become 9; letters in later words become a.
export function shapeOf(details) {
  const t = details.trim();
  const m = /^(\S+)(.*)$/s.exec(t);
  if (!m) return '';
  const rest = m[2].replace(/[0-9]/g, '9').replace(/[A-Za-z]/g, 'a');
  return m[1].replace(/[0-9]/g, '9') + rest;
}

const norm = (s) => s.toLowerCase().replace(/\(\$\)/g, '').replace(/\s+/g, '');

export function shapeReport(text) {
  const rows = splitCsv(text);
  const hi = rows.findIndex((r) => r.map(norm).includes('details') && r.map(norm).includes('date'));
  if (hi < 0) return 'No CommSec header row found.\n';
  const header = rows[hi].map((c) => c.trim());
  const di = rows[hi].map(norm).indexOf('details');
  const data = rows.slice(hi + 1);
  const counts = new Map();
  for (const r of data) {
    const s = shapeOf(r[di] ?? '');
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const lines = [`Header: ${header.join(',')}`, `Rows: ${data.length}`, 'Details shapes:'];
  for (const [s, n] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`  ${s} ×${n}`);
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node scripts/commsec-shape.mjs <path-to-csv>');
    process.exit(1);
  }
  process.stdout.write(shapeReport(readFileSync(path, 'utf8')));
}
