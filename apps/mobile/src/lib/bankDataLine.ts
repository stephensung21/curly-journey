import { institutionGroup } from '@curly/core';
import type { BankDataTime } from '../api/types';
import { dayBefore, plainDay, sydneyDate } from './days';

const time = (at: Date) =>
  at.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Australia/Sydney' }).replace(/\s/g, '').toLowerCase();

/**
 * "Bank data: CommBank today 7:41am · Amex yesterday 9:02pm": when PocketSmith last received each bank's data,
 * in Sydney time. Null before any bank has delivered.
 */
export function bankDataLine(bankData: BankDataTime[], now: Date): string | null {
  if (bankData.length === 0) return null;
  const today = sydneyDate(now);
  const parts = bankData.map(({ institution, at }) => {
    const when = new Date(at);
    const day = sydneyDate(when);
    const label = day === today ? 'today' : day === dayBefore(today) ? 'yesterday' : plainDay(day);
    return `${institutionGroup(institution)} ${label} ${time(when)}`;
  });
  return `Bank data: ${parts.join(' · ')}`;
}
