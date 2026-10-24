import { describe, it, expect } from 'vitest';
import { netWorth, grownValue, rangeStart, sinceNote, type NwAccount } from '../src/index';

const acct = (o: Partial<NwAccount> = {}): NwAccount => ({
  id: 1, name: 'Everyday', kind: 'transaction', balanceCents: 100000, balanceDate: '2026-10-24',
  source: 'pocketsmith', isOffset: false, countsNetWorth: true, growthBps: null, ...o,
});
const today = '2026-10-24';

describe('netWorth', () => {
  it('negative goes to owe, rest to own, total = own + owe', () => {
    const r = netWorth([acct(), acct({ id: 2, name: 'Amex', kind: 'credit_card', balanceCents: -2000 })], today);
    expect(r.own.map((l) => l.key)).toEqual(['acct:1']);
    expect(r.owe.map((l) => l.key)).toEqual(['acct:2']);
    expect(r.ownCents).toBe(100000);
    expect(r.oweCents).toBe(-2000);
    expect(r.totalCents).toBe(98000);
  });
  it('groups offsets into one Own line with members', () => {
    const r = netWorth([
      acct({ id: 1, balanceCents: 1000 }),
      acct({ id: 2, name: 'Off A', balanceCents: 5000, isOffset: true }),
      acct({ id: 3, name: 'Off B', balanceCents: 5000, isOffset: true }),
    ], today);
    const off = r.own.find((l) => l.key === 'offsets')!;
    expect(off.name).toBe('Offsets (2)');
    expect(off.valueCents).toBe(10000);
    expect(off.accountIds).toEqual([2, 3]);
    expect(off.members).toHaveLength(2);
    expect(r.own[0]?.key).toBe('offsets'); // sorted by |value| desc
    expect(r.totalCents).toBe(11000);
  });
  it('excludes accounts not counting', () => {
    const r = netWorth([acct(), acct({ id: 2, countsNetWorth: false, balanceCents: 999999 })], today);
    expect(r.totalCents).toBe(100000);
  });
  it('grows a manual home by growthBps', () => {
    const r = netWorth([acct({ source: 'manual', kind: 'manual_asset', balanceCents: 10000, balanceDate: '2025-10-24', growthBps: 500 })], today);
    expect(Math.abs(r.totalCents - 10500)).toBeLessThanOrEqual(1); // 365 vs 365.25 day year
  });
  it('flags stale manual only', () => {
    const r = netWorth([
      acct({ id: 1, source: 'manual', balanceDate: '2026-06-24' }),
      acct({ id: 2, source: 'pocketsmith', balanceDate: '2026-06-24' }),
    ], today);
    expect(r.own.find((l) => l.key === 'acct:1')!.stale).toBe(true);
    expect(r.own.find((l) => l.key === 'acct:2')!.stale).toBe(false);
  });
});

describe('grownValue', () => {
  it('one year at 5%', () => {
    expect(Math.abs(grownValue(10000, '2025-10-24', 500, today) - 10500)).toBeLessThanOrEqual(1);
  });
  it('exact 365.25 days', () => {
    expect(grownValue(100000, '2026-10-24', 500, today)).toBe(100000);
  });
});

describe('rangeStart', () => {
  it('maps ranges', () => {
    expect(rangeStart('6M', today)).toBe('2026-04-24');
    expect(rangeStart('1M', today)).toBe('2026-09-24');
    expect(rangeStart('1Y', today)).toBe('2025-10-24');
    expect(rangeStart('All', today)).toBeNull();
  });
});

describe('sinceNote', () => {
  it('first vs last', () => {
    expect(sinceNote([{ date: '2026-04-24', totalCents: 100 }, { date: '2026-05-01', totalCents: 150 }, { date: '2026-10-24', totalCents: 400 }]))
      .toEqual({ fromDate: '2026-04-24', deltaCents: 300 });
  });
  it('null under 2 points', () => {
    expect(sinceNote([])).toBeNull();
    expect(sinceNote([{ date: '2026-04-24', totalCents: 1 }])).toBeNull();
  });
});
