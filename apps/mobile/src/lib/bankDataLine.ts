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
  const parts = bankData.map(({ institution, at }) => `${institutionGroup(institution)} ${when(at, now)}`);
  return `Bank data: ${parts.join(' · ')}`;
}

/**
 * "Checked by PocketSmith: CommBank today 4:15pm": when PocketSmith last updated each bank's accounts, which can be
 * later than the newest transaction when nothing new happened. Null when PocketSmith gave no times.
 */
export function bankCheckedLine(bankData: BankDataTime[], now: Date): string | null {
  const parts = bankData.flatMap(({ institution, checkedAt }) =>
    checkedAt ? [`${institutionGroup(institution)} ${when(checkedAt, now)}`] : [],
  );
  return parts.length ? `Checked by PocketSmith: ${parts.join(' · ')}` : null;
}

/** "today 7:41am", "yesterday 9:02pm" or "Tue 20 Oct 3:10pm", in Sydney time. */
function when(iso: string, now: Date): string {
  const today = sydneyDate(now);
  const at = new Date(iso);
  const day = sydneyDate(at);
  const label = day === today ? 'today' : day === dayBefore(today) ? 'yesterday' : plainDay(day);
  return `${label} ${time(at)}`;
}
