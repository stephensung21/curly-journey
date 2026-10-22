import { describe, it, expect } from 'vitest';
import { formatAud, formatAudShort } from '../src/money';

describe('formatAud', () => {
  it('formats with cents by default', () => expect(formatAud(8420)).toBe('$84.20'));
  it('groups thousands', () => expect(formatAud(117700000, { decimals: 'never' })).toBe('$1,177,000'));
  it('uses a true minus sign', () => expect(formatAud(-231000, { decimals: 'never' })).toBe('−$2,310'));
  it('adds + when signed and positive', () =>
    expect(formatAud(470000, { signed: true, decimals: 'never' })).toBe('+$4,700'));
  it('masks when hidden', () => expect(formatAud(-231000, { hidden: true })).toBe('$•••'));
  it('rounds never-decimals half away from zero', () =>
    expect(formatAud(-12350, { decimals: 'never' })).toBe('−$124'));
  it('rejects non-integer cents', () => expect(() => formatAud(10.5)).toThrow());
});

describe('formatAudShort', () => {
  it('under 1k is whole dollars', () => expect(formatAudShort(50000)).toBe('$500'));
  it('thousands to one decimal, trimmed', () => {
    expect(formatAudShort(120000)).toBe('$1.2k');
    expect(formatAudShort(40000000)).toBe('$400k');
  });
  it('millions', () => expect(formatAudShort(120000000)).toBe('$1.2M'));
  it('rounds up across the k/M boundary', () => {
    expect(formatAudShort(99_995_000)).toBe('$1M');
    expect(formatAudShort(99_995)).toBe('$1k');
  });
  it('keeps values just under a boundary in the lower unit', () => {
    expect(formatAudShort(95_000)).toBe('$950');
    expect(formatAudShort(95_000_000)).toBe('$950k');
  });
  it('negative', () => expect(formatAudShort(-21400000)).toBe('−$214k'));
  it('zero', () => expect(formatAudShort(0)).toBe('$0'));
  it('masks when hidden', () => expect(formatAudShort(120000, { hidden: true })).toBe('$•••'));
});
