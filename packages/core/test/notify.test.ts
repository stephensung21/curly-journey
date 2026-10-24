import { describe, it, expect } from 'vitest';
import { planNotifications, type PlanInput, type CalendarEvent, type LimitStatus } from '../src/index';

const now = new Date('2026-10-24T22:30:00Z'); // 09:30 Sun 25 Oct Sydney

const ev = (o: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 1, name: 'Internet', emoji: '📶', amountCents: 8900, accountId: null,
  startDate: '2026-10-27', repeat: 'monthly', leadDays: 2, onDayAlert: false, ...o,
});
const lim = (o: Partial<LimitStatus> = {}): LimitStatus & { label: string } => ({
  id: 3, categoryId: 5, amountCents: 95000, warnPercent: 80, spentCents: 87400, percent: 92, level: 'warn',
  label: 'Dining out', ...o,
});
const input = (o: Partial<PlanInput> = {}): PlanInput => ({
  now, month: '2026-10', limits: [], occurrences: [], lastSyncSuccess: new Date('2026-10-25T00:00:00Z'),
  tradeHints: [], manual: [], enabled: { limit: true, bill: true, paid_check: true, sync: true, stale: true, trade_hint: true }, ...o,
});
const occ = (date: string, e = ev(), status: 'paid' | 'skipped' | null = null) => ({ event: e, date, status });

describe('planNotifications', () => {
  it('warn limit', () => {
    const r = planNotifications(input({ limits: [lim()] }));
    expect(r).toEqual([{
      keys: ['limit:3:2026-10:80'], type: 'limit', title: 'Spending limit',
      body: 'Dining out is at 92% of your limit', url: '/limits',
    }]);
  });
  it('over limit has two keys', () => {
    const r = planNotifications(input({ limits: [lim({ level: 'over', percent: 104 })] }));
    expect(r).toHaveLength(1);
    expect(r[0]!.keys).toEqual(['limit:3:2026-10:80', 'limit:3:2026-10:100']);
  });
  it('ok limit nothing', () => {
    expect(planNotifications(input({ limits: [lim({ level: 'ok', percent: 10 })] }))).toEqual([]);
  });
  it('lead reminder 2 days', () => {
    const r = planNotifications(input({ occurrences: [occ('2026-10-27')] }));
    expect(r).toEqual([{
      keys: ['bill:1:2026-10-27:lead'], type: 'bill', title: '📶 Internet',
      body: 'In 2 days · Tue 27 Oct', url: '/calendar',
    }]);
  });
  it('lead 1 not yet for 2 days away', () => {
    expect(planNotifications(input({ occurrences: [occ('2026-10-27', ev({ leadDays: 1 }))] }))).toEqual([]);
  });
  it('tomorrow', () => {
    const r = planNotifications(input({ occurrences: [occ('2026-10-26')] }));
    expect(r[0]!.body).toBe('Tomorrow · Mon 26 Oct');
  });
  it('on the day with onDayAlert', () => {
    const r = planNotifications(input({ occurrences: [occ('2026-10-25', ev({ onDayAlert: true }))] }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ keys: ['bill:1:2026-10-25:day'], body: 'Today · Sun 25 Oct' });
  });
  it('on the day without onDayAlert and lead 2 nothing', () => {
    expect(planNotifications(input({ occurrences: [occ('2026-10-25')] }))).toEqual([]);
  });
  it('on the day with lead 0 fires', () => {
    const r = planNotifications(input({ occurrences: [occ('2026-10-25', ev({ leadDays: 0 }))] }));
    expect(r[0]!.keys).toEqual(['bill:1:2026-10-25:day']);
  });
  it('before 09:00 only limits', () => {
    const r = planNotifications(input({
      now: new Date('2026-10-24T21:30:00Z'),
      limits: [lim()],
      occurrences: [occ('2026-10-26'), occ('2026-10-20')],
    }));
    expect(r.map((n) => n.type)).toEqual(['limit']);
  });
  it('did this get paid', () => {
    const r = planNotifications(input({ occurrences: [occ('2026-10-20')] }));
    expect(r).toEqual([{
      keys: ['paid:1:2026-10-20'], type: 'paid_check', title: 'Did this get paid?',
      body: 'Internet was due Tue 20 Oct', url: '/calendar?ask=1:2026-10-20',
    }]);
  });
  it('paid check needs 4+ days', () => {
    expect(planNotifications(input({ occurrences: [occ('2026-10-22')] }))).toEqual([]);
  });
  it('paid check stops after 30 days', () => {
    expect(planNotifications(input({ occurrences: [occ('2026-09-25')] }))).toHaveLength(1);
    expect(planNotifications(input({ occurrences: [occ('2026-09-24')] }))).toEqual([]);
  });
  it('paid or skipped nothing', () => {
    expect(planNotifications(input({ occurrences: [occ('2026-10-20', ev(), 'paid')] }))).toEqual([]);
    expect(planNotifications(input({ occurrences: [occ('2026-10-20', ev(), 'skipped')] }))).toEqual([]);
  });
  it('non-payable no paid check', () => {
    const e = ev({ amountCents: null, accountId: null });
    expect(planNotifications(input({ occurrences: [occ('2026-10-20', e)] }))).toEqual([]);
  });
  it('sync stale', () => {
    const r = planNotifications(input({ lastSyncSuccess: new Date('2026-10-23T08:00:00Z') }));
    expect(r).toEqual([{
      keys: ['sync:2026-10-23T08:00:00.000Z'], type: 'sync', title: "Bank sync isn't working",
      body: "Accounts haven't updated since Fri 23 Oct", url: '/',
    }]);
  });
  it('sync never', () => {
    const r = planNotifications(input({ lastSyncSuccess: null }));
    expect(r[0]).toMatchObject({ keys: ['sync:never'], body: "Accounts haven't synced yet" });
  });
  it('stale manual', () => {
    const r = planNotifications(input({ manual: [
      { id: 4, name: 'AMP super', balanceDate: '2026-07-24' },
      { id: 5, name: 'Fresh', balanceDate: '2026-10-01' },
      { id: 6, name: 'Never', balanceDate: null },
    ] }));
    expect(r).toEqual([{
      keys: ['stale:4:2026-07-24'], type: 'stale', title: 'Time to update',
      body: "AMP super hasn't been updated since 24 Jul", url: '/account/4',
    }]);
  });
  it('stale manual waits for 09:00 Sydney', () => {
    const manual = [{ id: 4, name: 'AMP super', balanceDate: '2026-07-24' }];
    expect(planNotifications(input({ now: new Date('2026-10-24T21:30:00Z'), manual })).filter(n => n.type === 'stale')).toEqual([]); // 08:30 Sun
    expect(planNotifications(input({ now: new Date('2026-10-24T22:30:00Z'), manual })).filter(n => n.type === 'stale')).toHaveLength(1); // 09:30
  });
  it('disabled bill removes only bills', () => {
    const r = planNotifications(input({
      limits: [lim()],
      occurrences: [occ('2026-10-27')],
      enabled: { limit: true, bill: false, paid_check: true, sync: true, stale: true, trade_hint: true },
    }));
    expect(r.map((n) => n.type)).toEqual(['limit']);
  });
  it('all types disabled produces nothing', () => {
    const r = planNotifications(input({
      limits: [lim()], occurrences: [occ('2026-10-27'), occ('2026-10-20')], lastSyncSuccess: null,
      manual: [{ id: 4, name: 'AMP super', balanceDate: '2026-07-24' }],
      enabled: { limit: false, bill: false, paid_check: false, sync: false, stale: false, trade_hint: false },
    }));
    expect(r).toEqual([]);
  });
  it('no dollar signs anywhere', () => {
    const r = planNotifications(input({
      limits: [lim({ level: 'over' })],
      occurrences: [
        occ('2026-10-27'),
        occ('2026-10-26', ev({ id: 2 })),
        occ('2026-10-25', ev({ id: 3, onDayAlert: true })),
        occ('2026-10-20', ev({ id: 4 })),
      ],
      lastSyncSuccess: null,
      manual: [{ id: 4, name: 'AMP super', balanceDate: '2026-07-24' }],
    }));
    expect(r.length).toBeGreaterThanOrEqual(6);
    for (const n of r) expect(`${n.title} ${n.body}`).not.toMatch(/\$/);
  });
  it('DST start: 09:00 AEDT on 4 Oct 2026 is 22:00Z on 3 Oct', () => {
    const o = occ('2026-10-04', ev({ leadDays: 0 }));
    const ls = new Date('2026-10-03T20:00:00Z');
    expect(planNotifications(input({ now: new Date('2026-10-03T21:59:00Z'), occurrences: [o], lastSyncSuccess: ls }))).toEqual([]);
    expect(planNotifications(input({ now: new Date('2026-10-03T22:00:00Z'), occurrences: [o], lastSyncSuccess: ls }))).toHaveLength(1);
  });
  it('DST end: 09:00 AEST on 4 Apr 2027 is 23:00Z on 3 Apr', () => {
    const o = occ('2027-04-04', ev({ startDate: '2027-04-04', leadDays: 0 }));
    const ls = new Date('2027-04-03T20:00:00Z');
    expect(planNotifications(input({ now: new Date('2027-04-03T22:59:00Z'), occurrences: [o], lastSyncSuccess: ls }))).toEqual([]);
    expect(planNotifications(input({ now: new Date('2027-04-03T23:00:00Z'), occurrences: [o], lastSyncSuccess: ls }))).toHaveLength(1);
  });
});

describe('trade hints', () => {
  const hints = [{ transactionId: 42, date: '2026-10-24' }];
  it('emits exact copy and key', () => {
    expect(planNotifications(input({ tradeHints: hints })).filter((n) => n.type === 'trade_hint')).toEqual([{
      keys: ['trade:42'], type: 'trade_hint', title: 'CommSec',
      body: 'Looks like you bought something on CommSec. Import or add the trade?', url: '/commsec?hint=42',
    }]);
  });
  it('nothing when pref off', () => {
    const e = { limit: true, bill: true, paid_check: true, sync: true, stale: true, trade_hint: false };
    expect(planNotifications(input({ tradeHints: hints, enabled: e }))).toEqual([]);
  });
  it('nothing before 09:00', () => {
    expect(planNotifications(input({ tradeHints: hints, now: new Date('2026-10-24T21:30:00Z') }))).toEqual([]);
  });
});
