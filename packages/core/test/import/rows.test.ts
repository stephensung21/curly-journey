import { describe, it, expect } from 'vitest';
import { parseCsvRecords, parseCommBankRows, parseCommBankCsv, parseAmexRows, parseAmexCsv } from '../../src/index';

describe('parseCsvRecords', () => {
  it('reports start lines; BOM ignored, blanks and quoted newlines advance', () => {
    const recs = parseCsvRecords('﻿a,b\r\n\r\n"x\ny",z\nlast,1');
    expect(recs).toEqual([
      { line: 1, cells: ['a', 'b'] },
      { line: 3, cells: ['x\ny', 'z'] },
      { line: 5, cells: ['last', '1'] },
    ]);
  });
});

describe('parseCommBankRows', () => {
  const text = '22/10/2026,"-1.00","A","+1.00"\n\n21/10/2026,"abc","B","+1.00"\n20/10/2026,"-2.00","C","+1.00"\n';
  it('skips bad rows with physical line numbers', () => {
    const { rows, skipped } = parseCommBankRows(text);
    expect(rows.map((r) => r.description)).toEqual(['A', 'C']);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.line).toBe(3);
    expect(skipped[0]!.reason).toMatch(/abc/);
  });
  it('wrapper still throws', () => {
    expect(() => parseCommBankCsv(text)).toThrow(RangeError);
  });
});

describe('short Amex rows', () => {
  const text = 'Date,Date Processed,Description,Card Member,Account #,Amount\n20/10/2026,21/10/2026,OK,S,1,5.00\n19/10/2026,20/10/2026,SHORT\n';
  it('are skipped with a reason', () => {
    const { rows, skipped } = parseAmexRows(text);
    expect(rows).toHaveLength(1);
    expect(skipped).toEqual([{ line: 3, reason: expect.stringMatching(/columns/) }]);
  });
  it('throw RangeError from the wrapper', () => {
    expect(() => parseAmexCsv(text)).toThrow(RangeError);
  });
});
