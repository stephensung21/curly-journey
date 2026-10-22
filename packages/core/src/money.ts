/** Money is always stored and passed as integer cents. */
export type Cents = number;

const MINUS = '−';
const MASK = '$•••';

const groupWhole = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const groupCents = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function assertCents(cents: Cents): void {
  if (!Number.isInteger(cents)) throw new RangeError(`Expected integer cents, got ${cents}`);
}

function sign(cents: Cents, signed: boolean): string {
  if (cents < 0) return MINUS;
  return signed && cents > 0 ? '+' : '';
}

/** Round half away from zero to whole dollars, returned as a non-negative number. */
function absWholeDollars(cents: Cents): number {
  return Math.floor((Math.abs(cents) + 50) / 100);
}

export function formatAud(
  cents: Cents,
  opts: { hidden?: boolean; decimals?: 'always' | 'never'; signed?: boolean } = {},
): string {
  assertCents(cents);
  if (opts.hidden) return MASK;
  const body =
    opts.decimals === 'never'
      ? groupWhole.format(absWholeDollars(cents))
      : groupCents.format(Math.abs(cents) / 100);
  return `${sign(cents, opts.signed ?? false)}$${body}`;
}

function trimmed(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

export function formatAudShort(cents: Cents, opts: { hidden?: boolean } = {}): string {
  assertCents(cents);
  if (opts.hidden) return MASK;
  const dollars = absWholeDollars(cents);
  // Promote to M when the k figure would round to 1000.0, so $999,950 shows as $1M, not $1000k.
  let body: string;
  if (Math.round(dollars / 100) >= 10_000) body = `${trimmed(dollars / 1_000_000)}M`;
  else if (dollars >= 1_000) body = `${trimmed(dollars / 1_000)}k`;
  else body = String(dollars);
  return `${sign(cents, false)}$${body}`;
}
