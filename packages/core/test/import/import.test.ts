import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseDecimalToCents,
  parseCsv,
  parseCommBankCsv,
  parseAmexCsv,
  normaliseDescription,
  isLikelyDuplicate,
  rowFingerprints,
} from '../../src/index';

const read = (name: string) => readFileSync(join(__dirname, '../fixtures', name), 'utf8');

describe('parseDecimalToCents', () => {
  it('parses signed, grouped and short decimals', () => {
    expect(parseDecimalToCents('+1,234.56')).toBe(123456);
    expect(parseDecimalToCents('-84.2')).toBe(-8420);
    expect(parseDecimalToCents('12')).toBe(1200);
    expect(parseDecimalToCents('0.07')).toBe(7);
  });
  it('is exact where float multiplication is not', () => {
    expect(parseDecimalToCents('1.15')).toBe(115);
    expect(parseDecimalToCents('8.2')).toBe(820);
  });
  it('throws RangeError on junk', () => {
    expect(() => parseDecimalToCents('abc')).toThrow(RangeError);
    expect(() => parseDecimalToCents('')).toThrow(RangeError);
    expect(() => parseDecimalToCents('1.234')).toThrow(RangeError);
    expect(() => parseDecimalToCents('1.2.3')).toThrow(RangeError);
  });
});

describe('parseCsv', () => {
  it('strips BOM, handles quotes, drops blank lines', () => {
    expect(parseCsv('﻿a,"b,c","d ""q"""\r\n\r\ne,f,g\n')).toEqual([
      ['a', 'b,c', 'd "q"'],
      ['e', 'f', 'g'],
    ]);
  });
});

describe('bank parsers', () => {
  it('parses CommBank', () => {
    const cba = parseCommBankCsv(read('commbank.csv'));
    expect(cba[0]).toEqual({ date: '2026-10-22', amountCents: -8420, description: 'WOOLWORTHS 1234 SYDNEY AU Card xx1234' });
    expect(cba).toHaveLength(4);
    expect(cba.some((r) => r.amountCents === 470000)).toBe(true);
  });
  it('parses Amex, negating charges', () => {
    const amex = parseAmexCsv(read('amex.csv'));
    expect(amex.find((r) => r.description.startsWith('MR WONG'))!.amountCents).toBe(-14600);
    expect(amex.find((r) => r.amountCents > 0)!.amountCents).toBe(253000);
    expect(amex[0]!.date).toBe('2026-10-20');
  });
  it('throws on Amex missing columns', () => {
    expect(() => parseAmexCsv('Date,Foo\n1/1/2026,x')).toThrow();
  });
});

describe('dedupe', () => {
  it('normalises descriptions', () => {
    expect(normaliseDescription('Woolworths 12-34 Syd.')).toBe('WOOLWORTHS1234SYD');
  });
  it('fingerprints distinguish repeated rows', () => {
    const fps = rowFingerprints(parseCommBankCsv(read('commbank.csv')));
    expect(new Set(fps).size).toBe(4);
    expect(fps[1]).toBe('2026-10-21|-450|KIOSK22SYD|0');
    expect(fps[2]).toBe('2026-10-21|-450|KIOSK22SYD|1');
  });
  it('detects likely duplicates', () => {
    expect(isLikelyDuplicate({ date: '2026-10-22', amountCents: -8420, description: 'WOOLWORTHS 1234 SYDNEY' },
                             { date: '2026-10-21', amountCents: -8420, description: 'Woolworths 1234 Sydney AU' })).toBe(true);
    expect(isLikelyDuplicate({ date: '2026-10-22', amountCents: -8420, description: 'WOOLWORTHS' },
                             { date: '2026-10-25', amountCents: -8420, description: 'WOOLWORTHS' })).toBe(false);
    expect(isLikelyDuplicate({ date: '2026-10-22', amountCents: -8420, description: 'WOOLWORTHS' },
                             { date: '2026-10-22', amountCents: -8421, description: 'WOOLWORTHS' })).toBe(false);
    expect(isLikelyDuplicate({ date: '2026-10-22', amountCents: -100, description: 'ALDI STORES' },
                             { date: '2026-10-22', amountCents: -100, description: 'COLES' })).toBe(false);
  });
  it('handles month boundary', () => {
    expect(isLikelyDuplicate({ date: '2026-10-31', amountCents: -100, description: 'ABCDEFGH' },
                             { date: '2026-11-02', amountCents: -100, description: 'ABCDEFGH' })).toBe(true);
  });
});
