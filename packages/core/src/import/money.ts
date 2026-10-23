import type { Cents } from '../money';

/** Parse a decimal money string to integer cents without float arithmetic. */
export function parseDecimalToCents(s: string): Cents {
  const m = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(s.trim().replace(/,/g, ''));
  if (!m) throw new RangeError(`Not a money amount: ${JSON.stringify(s)}`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new RangeError(`Amount out of range: ${JSON.stringify(s)}`);
  return m[1] === '-' ? -cents : cents;
}
