import { parseCsvRecords } from '../import/csv';
import { parseDecimalToCents } from '../import/money';
import { parseAuDate, type SkippedRow } from '../import/types';

export type TradeSide = 'buy' | 'sell';

export type ParsedTrade = {
  /** YYYY-MM-DD */
  date: string;
  reference: string | null;
  side: TradeSide;
  symbol: string;
  units: number;
  priceMicros: number;
  brokerageCents: number;
  totalCents: number;
};

/** Divide two non-negative BigInts, rounding half up. */
function divRound(n: bigint, d: bigint): bigint {
  return (2n * n + d) / (2n * d);
}

/** round(units × priceMicros / 10,000), half away from zero, exact via BigInt. */
export function grossCents(units: number, priceMicros: number): number {
  const n = BigInt(units) * BigInt(priceMicros);
  const neg = n < 0n;
  const q = divRound(neg ? -n : n, 10000n);
  return Number(neg ? -q : q);
}

/** Decimal dollars (up to 6 places) -> integer micro-dollars. */
export function parsePriceToMicros(s: string): number {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(s.trim());
  if (!m) throw new RangeError(`Not a price: ${JSON.stringify(s)}`);
  const micros = Number(m[1]) * 1_000_000 + Number((m[2] ?? '').padEnd(6, '0'));
  if (!Number.isSafeInteger(micros)) throw new RangeError(`Price out of range: ${JSON.stringify(s)}`);
  return micros;
}

const TRADE_START = /^[BS]\s+\d/i;
const TRADE = /^(B|S)\s+([\d.,]+)\s+([A-Z0-9]{2,6})(?:\.AX)?\s+@\s+([\d.]+)$/i;

const norm = (s: string) => s.toLowerCase().replace(/\(\$\)/g, '').replace(/\s+/g, '');

type Cols = { date: number; reference: number; details: number; debit: number; credit: number };

function findHeader(cells: string[]): Cols | null {
  const names = cells.map(norm);
  const cols = {
    date: names.indexOf('date'),
    reference: names.indexOf('reference'),
    details: names.indexOf('details'),
    debit: names.indexOf('debit'),
    credit: names.indexOf('credit'),
  };
  return cols.date >= 0 && cols.details >= 0 && cols.debit >= 0 && cols.credit >= 0 ? cols : null;
}

function parseTrade(cells: string[], c: Cols, details: string): ParsedTrade {
  const m = TRADE.exec(details);
  if (!m) throw new RangeError(`Unrecognised trade details: ${JSON.stringify(details)}`);
  const side: TradeSide = m[1]!.toUpperCase() === 'B' ? 'buy' : 'sell';
  const unitsText = m[2]!.replace(/,/g, '');
  if (!/^\d+$/.test(unitsText)) throw new RangeError('Units must be whole units');
  const units = Number(unitsText);
  if (!Number.isSafeInteger(units) || units <= 0) throw new RangeError('Units must be whole units above zero');
  const priceMicros = parsePriceToMicros(m[4]!);
  const date = parseAuDate(cells[c.date] ?? '');
  const amountText = (cells[side === 'buy' ? c.debit : c.credit] ?? '').trim();
  if (amountText === '') throw new RangeError(`Missing ${side === 'buy' ? 'Debit' : 'Credit'} amount`);
  const totalCents = parseDecimalToCents(amountText);
  const gross = grossCents(units, priceMicros);
  const brokerageCents = side === 'buy' ? totalCents - gross : gross - totalCents;
  if (brokerageCents < 0) throw new RangeError("Amount doesn't match units × price");
  const reference = (c.reference >= 0 ? (cells[c.reference] ?? '').trim() : '') || null;
  return { date, reference, side, symbol: m[3]!.toUpperCase(), units, priceMicros, brokerageCents, totalCents };
}

/** CommSec Transactions CSV. Columns found by header name; non-trade rows are ignored, bad trade rows skipped. */
export function parseCommSecRows(text: string): { trades: ParsedTrade[]; skipped: SkippedRow[]; ignored: number } {
  const records = parseCsvRecords(text);
  const trades: ParsedTrade[] = [];
  const skipped: SkippedRow[] = [];
  let ignored = 0;
  let cols: Cols | null = null;
  let headerAt = -1;
  for (let i = 0; i < records.length && !cols; i++) {
    cols = findHeader(records[i]!.cells);
    if (cols) headerAt = i;
  }
  if (!cols) {
    return { trades, skipped: records.map((r) => ({ line: r.line, reason: 'No CommSec header row' })), ignored };
  }
  for (const { line, cells } of records.slice(headerAt + 1)) {
    const details = (cells[cols.details] ?? '').trim();
    if (!TRADE_START.test(details)) {
      ignored++;
      continue;
    }
    try {
      trades.push(parseTrade(cells, cols, details));
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      skipped.push({ line, reason: e.message });
    }
  }
  return { trades, skipped, ignored };
}

/** Stable identity for de-duplicating re-imported trades. */
export function tradeFingerprint(
  t: Pick<ParsedTrade, 'date' | 'reference' | 'side' | 'symbol' | 'units' | 'priceMicros'>,
): string {
  return t.reference ? `ref:${t.reference}` : `${t.date}|${t.side}|${t.symbol}|${t.units}|${t.priceMicros}`;
}
