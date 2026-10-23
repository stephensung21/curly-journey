import { describe, expect, it } from 'vitest';
import { detectFlows, type AccountKind, type FlowTxn } from '../../src';

const t = (
  id: number,
  accountId: number,
  accountKind: AccountKind,
  date: string,
  amountCents: number,
  description = 'X',
): FlowTxn => ({ id, accountId, accountKind, date, amountCents, description, flow: 'normal', flowSource: 'auto' });

describe('detectFlows', () => {
  it('pairs closest date first, then lowest id', () => {
    const d = detectFlows([
      t(1, 1, 'transaction', '2026-10-01', -50000),
      t(2, 1, 'transaction', '2026-10-03', -50000),
      t(3, 2, 'savings', '2026-10-03', 50000),
      t(4, 2, 'savings', '2026-10-01', 50000),
      t(5, 1, 'transaction', '2026-10-20', -50000),
    ]);
    expect(d.get(1)).toEqual({ flow: 'transfer', pairId: 4 });
    expect(d.get(2)).toEqual({ flow: 'transfer', pairId: 3 });
    expect(d.get(5)).toEqual({ flow: 'normal', pairId: null });
  });

  it('does not pair beyond 3 days or on the same account', () => {
    const far = detectFlows([t(1, 1, 'transaction', '2026-10-01', -500), t(2, 2, 'savings', '2026-10-05', 500)]);
    expect(far.get(1)!.flow).toBe('normal');
    const same = detectFlows([t(1, 1, 'transaction', '2026-10-01', -500), t(2, 1, 'transaction', '2026-10-01', 500)]);
    expect(same.get(1)!.flow).toBe('normal');
    const edge = detectFlows([t(1, 1, 'transaction', '2026-10-01', -500), t(2, 2, 'savings', '2026-10-04', 500)]);
    expect(edge.get(1)!.flow).toBe('transfer');
  });

  it('marks outflow mortgage when paired into a mortgage account', () => {
    const m = detectFlows([
      t(1, 1, 'transaction', '2026-10-28', -310000),
      t(2, 3, 'mortgage', '2026-10-28', 310000),
    ]);
    expect(m.get(1)!.flow).toBe('mortgage');
    expect(m.get(2)!.flow).toBe('transfer');
  });

  it('applies keyword fallbacks to unpaired rows', () => {
    const flowOf = (x: FlowTxn) => detectFlows([x]).get(1)!.flow;
    expect(flowOf(t(1, 1, 'transaction', '2026-10-28', -310000, 'HOME LOAN REPAYMENT'))).toBe('mortgage');
    expect(flowOf(t(1, 4, 'credit_card', '2026-10-10', 253000, 'PAYMENT RECEIVED - THANK YOU'))).toBe('transfer');
    expect(flowOf(t(1, 4, 'credit_card', '2026-10-10', 4000, 'KMART REFUND'))).toBe('normal');
    expect(flowOf(t(1, 1, 'transaction', '2026-10-10', -253000, 'AMERICAN EXPRESS PAYMENT'))).toBe('transfer');
    expect(flowOf(t(1, 4, 'credit_card', '2026-10-10', -253000, 'AMEX SHOP'))).toBe('normal');
  });

  it('never pairs or outputs user/rule rows', () => {
    const d = detectFlows([
      { ...t(1, 1, 'transaction', '2026-10-01', -500), flowSource: 'user' },
      t(2, 2, 'savings', '2026-10-01', 500),
      { ...t(3, 1, 'transaction', '2026-10-01', -700), flowSource: 'rule' },
    ]);
    expect(d.has(1)).toBe(false);
    expect(d.has(3)).toBe(false);
    expect(d.get(2)).toEqual({ flow: 'normal', pairId: null });
  });
});
