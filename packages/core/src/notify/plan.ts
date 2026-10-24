import { isPayable, type CalendarEvent } from '../calendar/events';
import { dayLabel, dayMonthLabel, daysBetween, sydneyDate, sydneyHour } from '../dates';
import { isManualStale, limitMessage, type LimitStatus } from '../limits/limits';
import { isStale } from '../sync/staleness';

export type NotificationType = 'limit' | 'bill' | 'paid_check' | 'sync' | 'stale' | 'trade_hint';
export type PlannedNotification = { keys: string[]; type: NotificationType; title: string; body: string; url: string };
/** Window (days) either side of a CommSec transfer in which a buy is hinted (spec 9.9). */
export const TRADE_HINT_DAYS = 5;

export type PlanInput = {
  now: Date;
  month: string;
  limits: (LimitStatus & { label: string })[];
  occurrences: { event: CalendarEvent; date: string; status: 'paid' | 'skipped' | null }[];
  lastSyncSuccess: Date | null;
  tradeHints: { transactionId: number; date: string }[];
  manual: { id: number; name: string; balanceDate: string | null }[];
  enabled: Record<NotificationType, boolean>;
};

/** Notification text never carries dollar amounts: it passes through Google and Expo. */
export function planNotifications(p: PlanInput): PlannedNotification[] {
  const today = sydneyDate(p.now);
  const afterNine = sydneyHour(p.now) >= 9;
  const out: PlannedNotification[] = [];

  if (p.enabled.limit) {
    for (const l of p.limits) {
      if (l.level === 'ok') continue;
      const base = `limit:${l.id}:${p.month}:${l.warnPercent}`;
      out.push({
        keys: l.level === 'over' ? [base, `limit:${l.id}:${p.month}:100`] : [base],
        type: 'limit',
        title: 'Spending limit',
        body: limitMessage(l.label, l.percent),
        url: '/limits',
      });
    }
  }

  if (afterNine) {
    for (const { event: e, date, status } of p.occurrences) {
      if (status !== null) continue;
      if (p.enabled.bill) {
        const ahead = daysBetween(today, date);
        const title = `${e.emoji} ${e.name}`;
        if (e.leadDays > 0 && ahead > 0 && ahead <= e.leadDays) {
          const when = ahead === 1 ? 'Tomorrow' : `In ${ahead} days`;
          out.push({
            keys: [`bill:${e.id}:${date}:lead`], type: 'bill', title, body: `${when} · ${dayLabel(date)}`, url: '/calendar',
          });
        }
        if (date === today && (e.onDayAlert || e.leadDays === 0)) {
          out.push({
            keys: [`bill:${e.id}:${date}:day`], type: 'bill', title, body: `Today · ${dayLabel(date)}`, url: '/calendar',
          });
        }
      }
      if (p.enabled.paid_check && isPayable(e)) {
        const ago = daysBetween(date, today);
        if (ago >= 4 && ago <= 30) {
          out.push({
            keys: [`paid:${e.id}:${date}`],
            type: 'paid_check',
            title: 'Did this get paid?',
            body: `${e.name} was due ${dayLabel(date)}`,
            url: `/calendar?ask=${e.id}:${date}`,
          });
        }
      }
    }
  }

  if (p.enabled.sync && isStale(p.lastSyncSuccess, p.now)) {
    out.push({
      keys: [`sync:${p.lastSyncSuccess?.toISOString() ?? 'never'}`],
      type: 'sync',
      title: "Bank sync isn't working",
      body: p.lastSyncSuccess
        ? `Accounts haven't updated since ${dayLabel(sydneyDate(p.lastSyncSuccess))}`
        : "Accounts haven't synced yet",
      url: '/',
    });
  }

  if (p.enabled.stale && afterNine) {
    for (const m of p.manual) {
      if (m.balanceDate === null || !isManualStale(m.balanceDate, today)) continue;
      out.push({
        keys: [`stale:${m.id}:${m.balanceDate}`],
        type: 'stale',
        title: 'Time to update',
        body: `${m.name} hasn't been updated since ${dayMonthLabel(m.balanceDate)}`,
        url: `/account/${m.id}`,
      });
    }
  }

  if (p.enabled.trade_hint && afterNine) {
    for (const h of p.tradeHints) {
      out.push({
        keys: [`trade:${h.transactionId}`],
        type: 'trade_hint',
        title: 'CommSec',
        body: 'Looks like you bought something on CommSec. Import or add the trade?',
        url: `/commsec?hint=${h.transactionId}`,
      });
    }
  }

  return out;
}
