import { describe, it, expect } from 'vitest';
import { parseCommSecRows, tradeFingerprint, grossCents, parsePriceToMicros } from '../src/index';

const HEADER = 'Date,Reference,Details,Debit($),Credit($),Balance($)';

describe('parseCommSecRows', () => {
  it('parses a buy', () => {
    const r = parseCommSecRows(`${HEADER}\n24/10/2026,C1234567,B 15 VAS @ 102.450000,1546.75,,0.00\n`);
    expect(r.skipped).toEqual([]);
    expect(r.ignored).toBe(0);
    expect(r.trades).toEqual([
      { date: '2026-10-24', reference: 'C1234567', side: 'buy', symbol: 'VAS', units: 15, priceMicros: 102450000, brokerageCents: 1000, totalCents: 154675 },
    ]);
  });

  it('parses a sell using Credit', () => {
    const r = parseCommSecRows(`${HEADER}\n24/10/2026,C2,S 10 VGS @ 140.100000,,1391.00,0.00\n`);
    expect(r.skipped).toEqual([]);
    expect(r.trades[0]).toMatchObject({ side: 'sell', symbol: 'VGS', totalCents: 139100, brokerageCents: 1000 });
  });

  it('tolerates a title row above the header and an extra column', () => {
    const r = parseCommSecRows(
      `"Transactions for account 1234567"\n${HEADER},Extra\n24/10/2026,C1,B 15 VAS.AX @ 102.45,1546.75,,0.00,x\n`,
    );
    expect(r.skipped).toEqual([]);
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0]!.symbol).toBe('VAS');
  });

  it('finds columns by header name, not position', () => {
    const r = parseCommSecRows('Reference,Date,Credit($),Debit($),Details\nC1,24/10/2026,,1546.75,B 15 VAS @ 102.45\n');
    expect(r.trades[0]).toMatchObject({ reference: 'C1', totalCents: 154675 });
  });

  it('ignores non-trade rows', () => {
    const r = parseCommSecRows(`${HEADER}\n24/10/2026,,Direct Credit 123456 COMMONWEALTH,,500.00,500.00\n`);
    expect(r.ignored).toBe(1);
    expect(r.skipped).toEqual([]);
    expect(r.trades).toEqual([]);
  });

  it('skips fractional units', () => {
    const r = parseCommSecRows(`${HEADER}\n24/10/2026,C1,B 1.5 VAS @ 100,160.00,,0.00\n`);
    expect(r.trades).toEqual([]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.reason).toMatch(/whole units/);
  });

  it('skips when debit is below gross', () => {
    const r = parseCommSecRows(`${HEADER}\n24/10/2026,C1,B 15 VAS @ 102.45,1500.00,,0.00\n`);
    expect(r.trades).toEqual([]);
    expect(r.skipped[0]!.reason).toBe("Amount doesn't match units × price");
  });

  it('returns one skipped entry when there is no header', () => {
    const r = parseCommSecRows('24/10/2026,C1,B 15 VAS @ 102.45,1546.75,,0.00\n24/10/2026,C2,B 1 VGS @ 1,1.00,,0.00\n');
    expect(r.trades).toEqual([]);
    expect(r.skipped).toEqual([{ line: 1, reason: 'No CommSec header row' }]);
  });

  it('skips a trade-looking row it cannot read', () => {
    const r = parseCommSecRows(`${HEADER}\n24/10/2026,C1,B 5 VAS something odd,10.00,,0.00\n`);
    expect(r.skipped).toHaveLength(1);
  });
});

describe('tradeFingerprint', () => {
  const csv = `${HEADER}\n24/10/2026,C1,B 15 VAS @ 102.45,1546.75,,0.00\n24/10/2026,,B 15 VAS @ 102.45,1546.75,,0.00\n`;
  it('is stable across parses and varies with reference', () => {
    const a = parseCommSecRows(csv).trades;
    const b = parseCommSecRows(csv).trades;
    expect(tradeFingerprint(a[0]!)).toBe(tradeFingerprint(b[0]!));
    expect(tradeFingerprint(a[0]!)).toBe('ref:C1');
    expect(tradeFingerprint(a[1]!)).toBe('2026-10-24|buy|VAS|15|102450000');
    expect(tradeFingerprint(a[0]!)).not.toBe(tradeFingerprint({ ...a[0]!, reference: 'C2' }));
  });
});

describe('money helpers', () => {
  it('grossCents rounds and stays exact for large products', () => {
    expect(grossCents(3, 333333)).toBe(100);
    expect(grossCents(1_000_000, 999_999_999)).toBe(99_999_999_900);
  });
  it('parsePriceToMicros', () => {
    expect(parsePriceToMicros('102.45')).toBe(102450000);
    expect(parsePriceToMicros('100')).toBe(100000000);
    expect(() => parsePriceToMicros('1.1234567')).toThrow(RangeError);
    expect(() => parsePriceToMicros('abc')).toThrow(RangeError);
  });
});
