import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeReport } from './commsec-shape.mjs';

const sample = [
  'Transactions for account 1234567',
  'Date,Reference,Details,Debit($),Credit($),Balance($)',
  '24/10/2026,C1234567,B 15 VAS @ 102.450000,1546.75,,0.00',
  '25/10/2026,C7654321,B 20 VGS @ 140.100000,2822.00,,0.00',
  '26/10/2026,,Direct Credit 123456 COMMONWEALTH,,500.00,500.00',
].join('\n');

test('output has no amounts, names or reference values', () => {
  const out = shapeReport(sample);
  // Shapes only: counts removed, so any digit left must be 9.
  const shapes = out
    .split('\n')
    .filter((l) => l.startsWith('  '))
    .map((l) => l.replace(/ ×\d+$/, ''))
    .join('\n');
  assert.doesNotMatch(shapes, /[0-8]/);
  assert.doesNotMatch(out, /C1234567|C7654321|VAS|VGS|COMMONWEALTH|1546|102\.45|500/);
  assert.match(out, /Rows: 3/);
  assert.match(out, /B 99 aaa @ 999\.999999 ×2/);
  assert.match(out, /Direct aaaaaa 999999 aaaaaaaaaaaa ×1/);
});

test('no header', () => {
  assert.match(shapeReport('a,b\n1,2'), /No CommSec header row/);
});
