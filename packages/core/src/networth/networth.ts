import { daysBetween, shiftMonths } from '../dates';
import { isManualStale } from '../limits/limits';
import type { AccountKind } from '../sync/pocketsmith';

export type NwAccount = {
  id: number; name: string; kind: AccountKind; balanceCents: number; balanceDate: string | null;
  source: string; isOffset: boolean; countsNetWorth: boolean; growthBps: number | null;
};
export type NwLine = { key: string; name: string; valueCents: number; accountIds: number[]; stale: boolean; members?: NwLine[] };
export type NwRange = '1M' | '6M' | '1Y' | 'All';

/** Compound growth at growthBps a year over days/365.25. Display and snapshots only; never stored. */
export function grownValue(valueCents: number, asOf: string, growthBps: number, today: string): number {
  const days = Math.max(0, daysBetween(asOf, today));
  return Math.round(valueCents * Math.pow(1 + growthBps / 10_000, days / 365.25));
}

const byAbs = (a: NwLine, b: NwLine) => Math.abs(b.valueCents) - Math.abs(a.valueCents);

export function netWorth(accounts: NwAccount[], today: string) {
  const lines: NwLine[] = [];
  const offsets: NwLine[] = [];
  for (const a of accounts) {
    if (!a.countsNetWorth) continue;
    const manual = a.source === 'manual';
    const valueCents =
      manual && a.growthBps !== null && a.balanceDate !== null
        ? grownValue(a.balanceCents, a.balanceDate, a.growthBps, today)
        : a.balanceCents;
    const line: NwLine = {
      key: `acct:${a.id}`, name: a.name, valueCents, accountIds: [a.id],
      stale: manual && isManualStale(a.balanceDate, today),
    };
    (a.isOffset ? offsets : lines).push(line);
  }
  if (offsets.length > 0) {
    offsets.sort(byAbs);
    lines.push({
      key: 'offsets', name: `Offsets (${offsets.length})`,
      valueCents: offsets.reduce((s, l) => s + l.valueCents, 0),
      accountIds: offsets.flatMap((l) => l.accountIds),
      stale: offsets.some((l) => l.stale),
      members: offsets,
    });
  }
  const own = lines.filter((l) => l.valueCents >= 0).sort(byAbs);
  const owe = lines.filter((l) => l.valueCents < 0).sort(byAbs);
  const ownCents = own.reduce((s, l) => s + l.valueCents, 0);
  const oweCents = owe.reduce((s, l) => s + l.valueCents, 0);
  return { totalCents: ownCents + oweCents, ownCents, oweCents, own, owe };
}

export function rangeStart(range: NwRange, today: string): string | null {
  if (range === 'All') return null;
  return shiftMonths(today, -(range === '1M' ? 1 : range === '6M' ? 6 : 12));
}

export function sinceNote(points: { date: string; totalCents: number }[]): { fromDate: string; deltaCents: number } | null {
  if (points.length < 2) return null;
  const first = points[0]!;
  return { fromDate: first.date, deltaCents: points[points.length - 1]!.totalCents - first.totalCents };
}
