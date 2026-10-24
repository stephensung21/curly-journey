import type { Cents } from '../money';
import { daysBetween } from '../dates';
import { isPayable, type CalendarEvent } from './events';

export type PaymentCandidate = {
  id: number;
  accountId: number;
  date: string;
  amountCents: Cents;
  merchant: string;
  description: string;
};

export type DueOccurrence = { eventId: number; date: string };

const MAX_DAYS = 3;

function amountSimilar(e: CalendarEvent, t: PaymentCandidate): boolean {
  if (e.amountCents === null) return false;
  const tol = Math.max(200, Math.round(e.amountCents * 0.05));
  return Math.abs(Math.abs(t.amountCents) - e.amountCents) <= tol;
}

function nameSimilar(e: CalendarEvent, t: PaymentCandidate): boolean {
  const name = e.name.toLowerCase();
  if (!name) return false;
  const merchant = t.merchant.toLowerCase();
  const description = t.description.toLowerCase();
  return (
    merchant.includes(name) ||
    description.includes(name) ||
    (merchant.length >= 3 && name.includes(merchant))
  );
}

/** occurrenceKey (`${eventId}:${date}`) -> transaction id. */
export function matchPayments(
  due: DueOccurrence[],
  events: Map<number, CalendarEvent>,
  txns: PaymentCandidate[],
  taken: Set<number>,
): Map<string, number> {
  const used = new Set(taken);
  const result = new Map<string, number>();
  const ordered = [...due].sort((a, b) => a.date.localeCompare(b.date) || a.eventId - b.eventId);

  for (const occ of ordered) {
    const e = events.get(occ.eventId);
    if (!e || !isPayable(e)) continue;
    let best: { t: PaymentCandidate; both: boolean; dist: number } | null = null;
    for (const t of txns) {
      if (used.has(t.id) || t.amountCents >= 0) continue;
      const dist = Math.abs(daysBetween(occ.date, t.date));
      if (dist > MAX_DAYS) continue;
      if (e.accountId !== null && e.accountId !== t.accountId) continue;
      const amt = amountSimilar(e, t);
      const name = nameSimilar(e, t);
      if (!amt && !name) continue;
      const both = amt && name;
      if (
        !best ||
        (both && !best.both) ||
        (both === best.both && (dist < best.dist || (dist === best.dist && t.id < best.t.id)))
      ) {
        best = { t, both, dist };
      }
    }
    if (best) {
      used.add(best.t.id);
      result.set(`${occ.eventId}:${occ.date}`, best.t.id);
    }
  }
  return result;
}
