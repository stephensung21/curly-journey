import {
  addDays,
  isPayable,
  limitStatuses,
  matchPayments,
  monthKey,
  monthPeriod,
  occurrences,
  planNotifications,
  summarise,
  sydneyDate,
  WHOLE_MONTH_LABEL,
  type DueOccurrence,
} from '@curly/core';
import type { Deps } from '../app';
import type { Db } from '../db/db';
import { makeEventsRepo } from '../db/events';
import { makeLimitsRepo } from '../db/limits';
import { makeNotifyRepo } from '../db/notify';
import { makeRepo } from '../db/repo';

/**
 * Its own invocation, so its own Workers Free budget of 50 outbound requests. A run costs at most 15: 4 to load bills and
 * candidate payments, 1 to record auto-paid ones, 3 for limits, 4 for sync, manual accounts, prefs and devices, then
 * 1 claim, 1 push and 1 device cleanup.
 */
export const MAX_ALERT_CALLS = 30;
/** Unpaid bills are auto-ticked this far back. */
const MATCH_DAYS = 40;
/** A payment lands up to 3 days either side of the due date. */
const MATCH_SLACK = 3;
/** The planner looks this far back (paid checks) and ahead (lead reminders). */
const PLAN_BACK = 30;
const PLAN_AHEAD = 14;

const key = (eventId: number, date: string) => `${eventId}:${date}`;

export async function runAlerts(deps: Deps): Promise<{ matched: number; sent: number }> {
  let used = 0;
  const count = () => {
    if (++used > MAX_ALERT_CALLS) throw new Error('call budget exhausted');
  };
  const db: Db = {
    query(text, params) {
      count();
      return deps.db.query(text, params);
    },
  };
  const repo = makeRepo(db);
  const eventsRepo = makeEventsRepo(db);
  const notify = makeNotifyRepo(db);

  const now = deps.now();
  const today = sydneyDate(now);
  const matchFrom = addDays(today, -MATCH_DAYS);
  const candidateFrom = addDays(matchFrom, -MATCH_SLACK);

  // Statuses cover the planner's look-ahead too, so a bill skipped ahead of time gets no reminder.
  const [events, statuses, taken, candidates] = await Promise.all([
    eventsRepo.list(),
    eventsRepo.statuses(matchFrom, addDays(today, PLAN_AHEAD)),
    // Any occurrence within the slack of a candidate's date may already hold it, including ones too old to match now.
    eventsRepo.takenTransactionIds(addDays(candidateFrom, -MATCH_SLACK), addDays(today, MATCH_SLACK)),
    eventsRepo.paymentCandidates(candidateFrom, today),
  ]);
  const status = new Map(statuses.map((s) => [key(s.eventId, s.date), s.status]));

  const due: DueOccurrence[] = events
    .filter(isPayable)
    .flatMap((e) => occurrences(e, matchFrom, today).map((date) => ({ eventId: e.id, date })))
    .filter((o) => !status.has(key(o.eventId, o.date)));
  const matches = matchPayments(due, new Map(events.map((e) => [e.id, e])), candidates, taken);
  const matched = await eventsRepo.insertAutoPaid(
    [...matches].map(([k, transactionId]) => {
      const [eventId, date] = k.split(':');
      return { eventId: Number(eventId), date: date!, transactionId };
    }),
  );
  for (const k of matches.keys()) if (!status.has(k)) status.set(k, 'paid');

  const month = monthKey(now);
  const [limits, lines, categories, lastSync, accounts, enabled, devices] = await Promise.all([
    makeLimitsRepo(db).list(),
    repo.spendLines(monthPeriod(month)),
    repo.listCategories(),
    repo.lastSuccessfulSync(),
    repo.listAccounts(),
    notify.prefs(),
    deps.push ? notify.devices() : Promise.resolve([]),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const planned = planNotifications({
    now,
    month,
    limits: limitStatuses(limits, summarise(lines)).map((l) => ({
      ...l,
      // A limit's category is a foreign key, so it always has a name.
      label: l.categoryId === null ? WHOLE_MONTH_LABEL : categoryName.get(l.categoryId)!,
    })),
    occurrences: events.flatMap((event) =>
      occurrences(event, addDays(today, -PLAN_BACK), addDays(today, PLAN_AHEAD)).map((date) => ({
        event,
        date,
        status: status.get(key(event.id, date)) ?? null,
      })),
    ),
    lastSyncSuccess: lastSync?.finishedAt ?? null,
    manual: accounts
      .filter((a) => a.source === 'manual')
      .map((a) => ({ id: a.id, name: a.displayName ?? a.name, balanceDate: a.balanceDate })),
    enabled,
  });

  const push = deps.push;
  if (!push || devices.length === 0 || planned.length === 0) return { matched, sent: 0 };

  // Claim before sending, so a retried or overlapping run never sends the same key twice.
  const claimed = await notify.claimKeys([...new Set(planned.flatMap((n) => n.keys))]);
  const toSend = planned.filter((n) => n.keys.some((k) => claimed.has(k)));
  if (toSend.length === 0) return { matched, sent: 0 };

  let invalidTokens: string[];
  try {
    count();
    ({ invalidTokens } = await push.send(
      devices,
      toSend.map(({ title, body, url }) => ({ title, body, url })),
    ));
  } catch (e) {
    // Unclaim, so the next run tries these again rather than losing them. Uncounted: it must run even out of budget.
    await makeNotifyRepo(deps.db).releaseKeys([...claimed]);
    throw e;
  }
  await notify.removeDevices(invalidTokens);
  return { matched, sent: toSend.length };
}
