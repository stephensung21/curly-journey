import type { AccountKind } from '../sync/pocketsmith';
import type { Cents } from '../money';
import type { Flow } from './categorise';

export type FlowTxn = {
  id: number;
  accountId: number;
  accountKind: AccountKind;
  date: string;
  amountCents: Cents;
  description: string;
  flow: Flow;
  flowSource: 'auto' | 'user' | 'rule';
};

export type FlowDecision = { flow: Flow; pairId: number | null };

const MAX_PAIR_DAYS = 3;
const MORTGAGE_RE = /HOME ?LOAN|LOAN REPAYMENT|MORTGAGE/i;
const CARD_PAYMENT_RE = /PAYMENT|THANK YOU/i;
const AMEX_RE = /AMEX|AMERICAN EXPRESS/i;

function dayNumber(date: string): number {
  return Math.round(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000);
}

export function detectFlows(txns: FlowTxn[]): Map<number, FlowDecision> {
  const auto = txns.filter((t) => t.flowSource === 'auto');
  const outflows = auto.filter((t) => t.amountCents < 0);
  const inflows = auto.filter((t) => t.amountCents > 0);

  const candidates: { gap: number; o: FlowTxn; i: FlowTxn }[] = [];
  for (const o of outflows) {
    for (const i of inflows) {
      if (i.amountCents !== -o.amountCents || i.accountId === o.accountId) continue;
      const gap = Math.abs(dayNumber(i.date) - dayNumber(o.date));
      if (gap <= MAX_PAIR_DAYS) candidates.push({ gap, o, i });
    }
  }
  candidates.sort((a, b) => a.gap - b.gap || a.o.id - b.o.id || a.i.id - b.i.id);

  const out = new Map<number, FlowDecision>();
  for (const { o, i } of candidates) {
    if (out.has(o.id) || out.has(i.id)) continue;
    out.set(o.id, { flow: i.accountKind === 'mortgage' ? 'mortgage' : 'transfer', pairId: i.id });
    out.set(i.id, { flow: 'transfer', pairId: o.id });
  }

  for (const t of auto) {
    if (out.has(t.id)) continue;
    let flow: Flow = 'normal';
    if (t.amountCents < 0) {
      if (MORTGAGE_RE.test(t.description)) flow = 'mortgage';
      else if (t.accountKind !== 'credit_card' && AMEX_RE.test(t.description)) flow = 'transfer';
    } else if (t.amountCents > 0 && t.accountKind === 'credit_card' && CARD_PAYMENT_RE.test(t.description)) {
      flow = 'transfer';
    }
    out.set(t.id, { flow, pairId: null });
  }
  return out;
}
