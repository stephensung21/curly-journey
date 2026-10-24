# Plan 4: Warnings, Calendar, Alerts, CoinSpot and Manual Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can:
- set monthly spending limits and get warned about them;
- keep a bills and dates calendar whose bills tick themselves off when the payment shows up;
- receive push notifications for limits, bills, unpaid bills, sync problems and stale manual values;
- see CoinSpot and manually entered accounts, such as AMP super, alongside the bank accounts.

**Architecture:**
- **Pure logic goes in `packages/core`**, unit-tested with plain data:
  - event recurrence;
  - payment matching;
  - limit status;
  - the notification planner, which decides what to send and under which once-only keys.
- **A second Worker cron runs an hourly alerts job** (`7 * * * *`). It gets its own 50-request budget and never shares one with a sync. The job:
  1. auto-ticks paid bills;
  2. evaluates limits, bills, sync health and manual staleness;
  3. logs each notification key once;
  4. sends new notifications through the Expo push service.
- **CoinSpot is fetched inside `runSync`**, using a read-only key, and costs 3 calls. If CoinSpot fails, the PocketSmith sync carries on.
- **Manual accounts** (AMP super, home value) are `account` rows with `source = 'manual'` and a value history.
- **Mobile adds:**
  - Limits, Calendar, Event editor, Notifications, Add manual account;
  - manual and CoinSpot variants of account detail;
  - a Home warning chip and upcoming events;
  - limit markers on the Spending tab;
  - a restructured More tab.

**Tech Stack:**
- Everything from Plans 1–3.
- New native module `expo-notifications`. The APK is rebuilt in Task 16.
- Push goes through Expo's push service (`https://exp.host/--/api/v2/push/send`) over Firebase Cloud Messaging. The owner sets up Firebase in Task 16.

**Spec:** `docs/superpowers/specs/2026-10-22-curly-journey-v1-design.md` (§7 rows "Warning thresholds", "Bill alert default", "Auto-mark bills paid", "Manual-entry staleness"; §8 rows CoinSpot, AMP super, Home; §9.1 top card and "next 1–2 events"; §9.3 limit markers; §9.6; §9.7; §9.8 per-account toggles; §9.11; §11 step 4) and `docs/superpowers/specs/2026-10-22-curly-journey-v1-visual-design.md` (§2.3 floating action button; §3 "Never" handwriting for warnings; §4 voice; §5 Chip and Category bar; screens H, S, 4, 8; §8a "Did this get paid?" sheet and Hide balances). Mockups: `docs/design/mockups/04-bills-calendar.html` and `docs/design/mockups/08-more-settings-limits.html`. Executors read both specs.

## Global Constraints

- **Everything from Plans 1–3 still applies:**
  - integer cents;
  - `Australia/Sydney` dates and months;
  - `<Amount>` for every dollar figure;
  - auth on every route except `/health`;
  - secrets only in Worker secrets;
  - never overwrite the owner;
  - the 50-request Workers Free limit: bulk SQL, bounded queries;
  - mobile Jest only as `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i --forceExit <pattern>`.
- **Where new SQL lives:** in new modules under `apps/api/src/db/` (`limits.ts`, `events.ts`, `notify.ts`, `manual.ts`), with the same conventions as `repo.ts`. Dates are cast to text, bigints to numbers, and each module exports a `make…Repo(db)`. `repo.ts` is already at about 1,000 lines. Changes to existing `repo.ts` functions stay in `repo.ts`.
- **No dollar amounts in notification text.** Notifications pass through Google's and Expo's servers, and hide balances must hold. Category names, event names, percentages and dates are fine.
- **Every notification fires once per key.** Keys go into `notification_log` before sending, and are removed again if the send fails. Key formats are fixed by Task 2.
- **Reminder time:** bill reminders and "did this get paid?" go out at the first alerts run at or after **09:00 Sydney** on the day they are due to send.
- **A payable event** has an amount or a paid-from account. Only payable events are auto-ticked, get PAID pills, or get "did this get paid?". Other events, like "Amex statement closes", are reminders only.
- **Limit levels:**
  - `percent = floor(max(0, spent) × 100 / limit)`;
  - `over` when percent ≥ 100;
  - `warn` when percent ≥ `warnPercent`;
  - otherwise `ok`.
  - `warnPercent` is per limit, from 50 to 99, default 80. The 100% threshold is fixed.
- **Manual accounts:**
  - `source = 'manual'`, institution `'Manual'`, kind `'manual_asset'`;
  - counts: spending **off**, net worth on, projections off;
  - they **need an update** when the latest value's as-of date is on or before today minus 3 calendar months.
- **The CoinSpot account:**
  - `source = 'coinspot'`, `external_id = 'coinspot'`, institution `'CoinSpot'`, name `'CoinSpot'`, kind `'crypto'`;
  - counts: spending **off**, net worth on, projections off.
- **Copy is exact.** Use the quoted strings verbatim. Warnings are plain Bricolage text, never Caveat.

## Review Focus

1. **Month-end and leap-day repeats.** A monthly bill on the 31st must fall on 30 Nov and 28/29 Feb, not skip the month or drift. A yearly event on 29 Feb falls on 28 Feb in other years. Task 1 tests these.
2. **Notifications must arrive exactly once.** An alerts run that fails part-way, a retried cron, or a send that errors must neither double-send nor lose a notification for good. Task 8 tests the insert-then-rollback path.
3. **Sydney time across daylight saving.** "09:00 Sydney" and "today" must hold on the October and April changeover days. Task 2 tests a UTC instant on 2026-10-04 (AEDT starts) and on 2027-04-04.
4. **A CoinSpot outage or a missing key never breaks bank sync.** Task 6 tests that a CoinSpot error still lets the run finish `ok`, and that no CoinSpot client means no CoinSpot calls.
5. **Hide balances and privacy in pushes.** No planner output contains `$` or digits taken from cents. Task 2 asserts that no title or body matches `/\$/`.

---

### Task 1: Core dates, event recurrence and payment matching

**Files:**
- Modify: `packages/core/src/dates.ts`
- Create: `packages/core/src/calendar/events.ts`, `packages/core/src/calendar/match.ts`
- Modify: `packages/core/src/index.ts` (export both)
- Test: `packages/core/test/dates-days.test.ts`, `packages/core/test/calendar.test.ts`

**Interfaces:**
- Produces (dates.ts):
  - `sydneyDate(d: Date): string` (YYYY-MM-DD);
  - `sydneyHour(d: Date): number` (0–23);
  - `addDays(iso: string, n: number): string`;
  - `daysBetween(a: string, b: string): number` (b − a in whole days);
  - `minusMonths(iso: string, n: number): string`, which clamps the day to the month's end;
  - `dayLabel(iso): string` like `'Tue 27 Oct'`;
  - `dayMonthLabel(iso): string` like `'27 Jul'`.
- Produces (events.ts):
  ```ts
  export type Repeat = 'none' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly';
  export type CalendarEvent = {
    id: number; name: string; emoji: string; amountCents: Cents | null; accountId: number | null;
    startDate: string; repeat: Repeat; leadDays: number; onDayAlert: boolean;
  };
  export function occurrences(e: CalendarEvent, from: string, to: string): string[]; // inclusive, ascending
  export function isOccurrence(e: CalendarEvent, date: string): boolean;
  export function isPayable(e: Pick<CalendarEvent, 'amountCents' | 'accountId'>): boolean;
  export const REPEAT_LABEL: Record<Repeat, string>; // none 'once', weekly 'weekly', fortnightly 'fortnightly', monthly 'monthly', quarterly 'quarterly', yearly 'yearly'
  ```
- Produces (match.ts):
  ```ts
  export type PaymentCandidate = { id: number; accountId: number; date: string; amountCents: Cents; merchant: string; description: string };
  export type DueOccurrence = { eventId: number; date: string };
  /** occurrenceKey -> transaction id. Key is `${eventId}:${date}`. */
  export function matchPayments(due: DueOccurrence[], events: Map<number, CalendarEvent>, txns: PaymentCandidate[], taken: Set<number>): Map<string, number>;
  ```

**Rules:**
- **Recurrence:** occurrence *k* (k ≥ 0) of a repeating event is `startDate` plus:
  - 7k days (weekly);
  - 14k days (fortnightly);
  - k months (monthly);
  - 3k months (quarterly);
  - 12k months (yearly).

  Month steps use the start date's day, clamped to the target month's last day. Always compute from `startDate`, never from the previous occurrence, so 31 Jan → 28 Feb → 31 Mar. A `'none'` event occurs only on `startDate`. Nothing occurs before `startDate`.
- **Payment matching:** a transaction matches an occurrence when all of these hold:
  - `amountCents < 0`;
  - `|daysBetween(occ.date, txn.date)| ≤ 3`;
  - the event's `accountId` is null or equals the transaction's account;
  - the transaction is not in `taken` and not already matched in this call;
  - at least one of:
    - **amount-similar:** the event has an amount and `| |txn| − amount | ≤ max(200, round(amount × 0.05))`;
    - **name-similar:** lowercased, the merchant or description contains the event name, or the event name contains the merchant and the merchant is 3 characters or longer.

  **Order:** process occurrences in ascending date, then event ID. For each occurrence, pick the best candidate by:
  1. amount-similar and name-similar first;
  2. then the smaller day distance;
  3. then the lower transaction ID.

  Events that aren't payable never match.

- [ ] **Step 1: Write the failing tests**
  - **dates-days.test.ts:**
    - `sydneyDate(new Date('2026-10-03T14:30:00Z'))` → `'2026-10-04'`;
    - `sydneyHour(new Date('2026-10-03T23:00:00Z'))` → `10` (AEDT, +11);
    - `sydneyHour(new Date('2027-04-04T00:00:00Z'))` → `10` (AEST, +10, after the change);
    - `addDays('2026-02-27', 2)` → `'2026-03-01'`;
    - `daysBetween('2026-10-25', '2026-10-28')` → `3`, and reversed → `-3`;
    - `minusMonths('2026-05-31', 3)` → `'2026-02-28'`;
    - `dayLabel('2026-10-27')` → `'Tue 27 Oct'`;
    - `dayMonthLabel('2026-07-24')` → `'24 Jul'`.
  - **calendar.test.ts:**
    - monthly from `2026-01-31` over `2026-01-01..2026-05-31` → `['2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31']`;
    - yearly from `2024-02-29` over `2024-01-01..2028-12-31` → `['2024-02-29','2025-02-28','2026-02-28','2027-02-28','2028-02-29']`;
    - fortnightly from `2026-10-02` over `2026-10-01..2026-10-31` → `['2026-10-02','2026-10-16','2026-10-30']`;
    - quarterly from `2026-10-28` over `2026-10-01..2027-04-30` → `['2026-10-28','2027-01-28','2027-04-28']`;
    - `'none'` → only the start date, and `[]` when it's outside the window;
    - a window before the start date → `[]`;
    - `isOccurrence` true for `'2027-01-28'` (quarterly above) and false for `'2026-11-28'`;
    - `isPayable({amountCents:null, accountId:null})` → false, and true with either field set.
  - **Matching tests** (event 1 "Internet", amount 8900, account null; event 2 "Netflix", no amount, account 5):
    - a −8,950 txn dated 2 days after the due date matches event 1 (within 5%);
    - a −9,500 txn doesn't match (outside both 5% and $2);
    - a −1,599 "NETFLIX.COM" txn on account 5 matches event 2 by name; the same on account 6 doesn't;
    - a +8,900 txn never matches;
    - a txn 4 days away doesn't match;
    - with two candidates, the closer date wins, and on equal dates the lower ID wins;
    - a candidate that is both amount- and name-similar beats a closer amount-only one;
    - two occurrences can't take the same txn;
    - a txn in `taken` is skipped;
    - a non-payable event returns nothing.
- [ ] **Step 2:** `npm test -w @curly/core` should fail with missing exports.
- [ ] **Step 3:** Implement. Use the existing `TZ` and `@date-fns/tz` for the Sydney helpers. Do the date arithmetic on UTC dates from the ISO parts.
- [ ] **Step 4:** `npm test -w @curly/core` and `npx tsc --noEmit -p packages/core` should both pass.
- [ ] **Step 5:** Commit `feat(core): event recurrence, payment matching and Sydney day helpers`.

### Task 2: Core limit status and notification planner

**Files:**
- Create: `packages/core/src/limits/limits.ts`, `packages/core/src/notify/plan.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/src/sync/pocketsmith.ts` (`AccountKind` gains `'crypto'`; `defaultCounts('crypto')` → spending false, net worth true, projections off)
- Test: `packages/core/test/limits.test.ts`, `packages/core/test/notify.test.ts`, `packages/core/test/pocketsmith.test.ts` (one case for crypto)

**Interfaces:**
- Consumes: Task 1 (`CalendarEvent`, `isPayable`, `sydneyDate`, `sydneyHour`, `daysBetween`, `minusMonths`, `dayLabel`, `dayMonthLabel`, `REPEAT_LABEL`), `Summary` and `isStale`.
- Produces:
  ```ts
  export type SpendingLimit = { id: number; categoryId: number | null; amountCents: Cents; warnPercent: number };
  export type LimitLevel = 'ok' | 'warn' | 'over';
  export type LimitStatus = SpendingLimit & { spentCents: Cents; percent: number; level: LimitLevel };
  export function limitStatuses(limits: SpendingLimit[], s: Pick<Summary, 'totalCents' | 'byCategory'>): LimitStatus[];
  export function limitMessage(label: string, percent: number): string; // `${label} is at ${percent}% of your limit`
  export const WHOLE_MONTH_LABEL = "This month's spending";
  export function isManualStale(balanceDate: string | null, today: string): boolean; // null → true; else balanceDate <= minusMonths(today, 3)

  export type NotificationType = 'limit' | 'bill' | 'paid_check' | 'sync' | 'stale';
  export type PlannedNotification = { keys: string[]; type: NotificationType; title: string; body: string; url: string };
  export type PlanInput = {
    now: Date;
    month: string;
    limits: (LimitStatus & { label: string })[];
    occurrences: { event: CalendarEvent; date: string; status: 'paid' | 'skipped' | null }[];
    lastSyncSuccess: Date | null;
    manual: { id: number; name: string; balanceDate: string | null }[];
    enabled: Record<NotificationType, boolean>;
  };
  export function planNotifications(p: PlanInput): PlannedNotification[];
  ```

**Planner rules.** Here `today = sydneyDate(now)` and `afterNine = sydneyHour(now) >= 9`.
- **Limits:**
  - a `warn` limit produces keys `[limit:{id}:{month}:{warnPercent}]`;
  - an `over` limit produces `[limit:{id}:{month}:{warnPercent}, limit:{id}:{month}:100]`;
  - title `'Spending limit'`, body `limitMessage(label, percent)`, url `'/limits'`.
  - These are sent at any hour.
- **Bill reminders** (only when `afterNine`; only for occurrences with `status === null`):
  - **Lead reminder:** when `leadDays > 0` and `0 < daysBetween(today, date) <= leadDays`. Key `bill:{eventId}:{date}:lead`. Body `'Tomorrow · Tue 27 Oct'` when 1 day away, `'In 2 days · Tue 27 Oct'` otherwise.
  - **On-the-day reminder:** when `date === today` and (`onDayAlert` is set or `leadDays === 0`). Key `bill:{eventId}:{date}:day`. Body `'Today · Tue 27 Oct'`.
  - Both use title `` `${emoji} ${name}` `` and url `'/calendar'`.
- **Did this get paid** (only when `afterNine`): for a payable event with `status === null` where `4 <= daysBetween(date, today) <= 30`:
  - key `paid:{eventId}:{date}`;
  - title `'Did this get paid?'`;
  - body `` `${name} was due ${dayLabel(date)}` ``;
  - url `` `/calendar?ask=${eventId}:${date}` ``.
- **Sync problems:** when `isStale(lastSyncSuccess, now)`:
  - key `` sync:${lastSyncSuccess?.toISOString() ?? 'never'} ``;
  - title `"Bank sync isn't working"`;
  - body `` `Accounts haven't updated since ${dayLabel(sydneyDate(lastSyncSuccess))}` ``, or `"Accounts haven't synced yet"` when there's never been a sync;
  - url `'/'`.
- **Stale manual values:** for each manual account where `balanceDate !== null` and `isManualStale(balanceDate, today)`:
  - key `stale:{id}:{balanceDate}`;
  - title `'Time to update'`;
  - body `` `${name} hasn't been updated since ${dayMonthLabel(balanceDate)}` ``;
  - url `` `/account/${id}` ``.
- **Turned-off types** produce nothing.

- [ ] **Step 1: Write the failing tests**
  - **limits.test.ts:**
    - a whole-month limit of 600,000 with `totalCents` 496,000 → percent 82, level `warn` (warn 80);
    - a category limit of 95,000 with category spend 87,400 → 92, `warn`;
    - 100,000 against 100,000 → 100, `over`;
    - spend −500 (refunds) → percent 0, `ok`;
    - a category with no spend → spentCents 0;
    - `limitMessage('Dining out', 92)` → `'Dining out is at 92% of your limit'`;
    - `isManualStale('2026-07-24','2026-10-24')` true; `'2026-07-25'` false; `null` true.
  - **notify.test.ts** (now = `2026-10-24T22:30:00Z`, which is 09:30 on 25 Oct in Sydney, so today is `2026-10-25`):
    - warn limit id 3 (warn 80, percent 92, label 'Dining out') → one notification, keys `['limit:3:2026-10:80']`, body `'Dining out is at 92% of your limit'`;
    - over limit → two keys;
    - monthly event "Internet" 📶 due `2026-10-27`, lead 2 → body `'In 2 days · Tue 27 Oct'`, key `bill:1:2026-10-27:lead`; at lead 1 nothing yet;
    - due `2026-10-26` → `'Tomorrow · Mon 26 Oct'`;
    - due today with `onDayAlert` → `'Today · Sun 25 Oct'`; without it and lead 2 → nothing;
    - the same inputs at `2026-10-24T21:30:00Z` (08:30 Sydney) → no bill or paid notifications, but the limit one still appears;
    - a payable event due `2026-10-20` with status null → `'Internet was due Tue 20 Oct'`, url `'/calendar?ask=1:2026-10-20'`; due `2026-10-22` → nothing (3 days); status `'paid'` → nothing; a non-payable event → nothing;
    - lastSyncSuccess `2026-10-23T08:00:00Z` → `"Accounts haven't updated since Fri 23 Oct"`, key `sync:2026-10-23T08:00:00.000Z`; null → `"Accounts haven't synced yet"`, key `sync:never`;
    - manual "AMP super" `balanceDate` `2026-07-24` → `"AMP super hasn't been updated since 24 Jul"`;
    - `enabled.bill = false` removes the bill notifications only;
    - every planned title and body in a full input, with amounts set on every event, contains no `$`.
- [ ] **Step 2:** `npm test -w @curly/core` should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test -w @curly/core` and the core typecheck should both pass.
- [ ] **Step 5:** Commit `feat(core): limit status, notification planner, crypto account kind`.

### Task 3: Migration 0005 and the limits API

**Files:**
- Create: `apps/api/migrations/0005_planner.sql`, `apps/api/src/db/limits.ts`, `apps/api/src/routes/limits.ts`
- Modify: `apps/api/src/app.ts` (route)
- Test: `apps/api/test/limits.test.ts`, `apps/api/test/migrations.test.ts` (new, schema checks)

**Migration `0005_planner.sql`** (write it exactly in this shape):
```sql
alter table account drop constraint if exists account_source_check;
alter table account add constraint account_source_check check (source in ('pocketsmith','manual','coinspot'));
alter table account add column if not exists synced_at timestamptz;

create table if not exists spending_limit (
  id serial primary key,
  category_id int unique references category(id),
  amount_cents bigint not null check (amount_cents > 0),
  warn_percent int not null default 80 check (warn_percent between 50 and 99),
  created_at timestamptz not null default now()
);
create unique index if not exists spending_limit_one_whole_month on spending_limit ((category_id is null)) where category_id is null;

create table if not exists calendar_event (
  id serial primary key,
  name text not null,
  emoji text not null default '📅',
  amount_cents bigint check (amount_cents > 0),
  account_id int references account(id) on delete set null,
  start_date date not null,
  repeat text not null check (repeat in ('none','weekly','fortnightly','monthly','quarterly','yearly')),
  lead_days int not null default 2 check (lead_days between 0 and 14),
  on_day_alert boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists event_occurrence (
  event_id int not null references calendar_event(id) on delete cascade,
  due_date date not null,
  status text not null check (status in ('paid','skipped')),
  source text not null check (source in ('auto','user')),
  transaction_id bigint references transaction(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (event_id, due_date)
);

create table if not exists push_device (token text primary key, created_at timestamptz not null default now());

create table if not exists notification_pref (
  type text primary key check (type in ('limit','bill','paid_check','sync','stale')),
  enabled boolean not null
);
insert into notification_pref (type, enabled) values
  ('limit', true), ('bill', true), ('paid_check', true), ('sync', true), ('stale', true)
on conflict do nothing;

create table if not exists notification_log (key text primary key, sent_at timestamptz not null default now());

create table if not exists account_value (
  id serial primary key,
  account_id int not null references account(id) on delete cascade,
  as_of date not null,
  value_cents bigint not null,
  unique (account_id, as_of)
);

create table if not exists account_holding (
  account_id int not null references account(id) on delete cascade,
  symbol text not null,
  units text not null,
  aud_cents bigint not null,
  primary key (account_id, symbol)
);

insert into calendar_event (name, emoji, start_date, repeat)
select 'Mortgage repayment', '🏦', date '2026-10-28', 'monthly'
where not exists (select 1 from calendar_event where name = 'Mortgage repayment');
insert into calendar_event (name, emoji, start_date, repeat)
select 'Amex statement closes', '💳', date '2026-10-25', 'monthly'
where not exists (select 1 from calendar_event where name = 'Amex statement closes');
```

**Interfaces:**
- Produces: `makeLimitsRepo(db)` with:
  - `list(): Promise<SpendingLimit[]>`;
  - `create(l: Omit<SpendingLimit,'id'>): Promise<SpendingLimit | null>` (null on a duplicate);
  - `update(id, patch: { amountCents?: number; warnPercent?: number }): Promise<SpendingLimit | null>`;
  - `remove(id): Promise<boolean>`;
  - `alertedAt(month: string): Promise<Map<number, string>>` (limit ID → latest `notification_log.sent_at` ISO among keys `limit:{id}:{month}:%`).
- **Routes:**
  - `GET /limits?month=YYYY-MM` returns `{ limits: (LimitStatus & { alertedAt: string | null })[] }`. Spending comes from `repo.spendLines(monthPeriod(month))` and `summarise`, the same as `/spending` with no filter.
  - `POST /limits` takes `{ categoryId: number|null, amountCents: int>0, warnPercent?: 50–99 }` and returns 201. Errors:
    - 400 `bad_limit`;
    - 400 `category_not_found` for a missing or income category;
    - 409 `limit_exists`.
  - `PATCH /limits/:id` takes `{ amountCents?, warnPercent? }` and returns 404 `limit_not_found` for an unknown ID.
  - `DELETE /limits/:id` returns 204, or 404.

- [ ] **Step 1: Write the failing tests**
  - **migrations.test.ts:** a fresh PGlite has 2 seeded events, 5 prefs, all enabled. Inserting an account with source `'coinspot'` succeeds, and `'other'` fails.
  - **limits.test.ts:**
    - create a whole-month limit and a Groceries limit;
    - a second whole-month limit → 409;
    - an Income category → 400 `category_not_found`;
    - `warnPercent: 100` → 400;
    - `GET /limits?month=2026-10` with seeded spend returns the right percent and level;
    - after inserting a `notification_log` key `limit:{id}:2026-10:80`, `alertedAt` is that timestamp;
    - PATCH changes the amount;
    - DELETE removes the limit.
- [ ] **Step 2:** `npm test -w @curly/api` should fail.
- [ ] **Step 3:** Implement the migration, repo and routes.
- [ ] **Step 4:** API tests and `npx tsc --noEmit -p apps/api` should both pass.
- [ ] **Step 5:** Commit `feat(api): planner schema and spending limits API`.

### Task 4: Events API

**Files:**
- Create: `apps/api/src/db/events.ts`, `apps/api/src/routes/events.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/events.test.ts`

**Interfaces:**
- Consumes: `CalendarEvent`, `occurrences`, `isOccurrence` and `isPayable` (Task 1).
- Produces: `makeEventsRepo(db)` with:
  - `list(): Promise<CalendarEvent[]>`;
  - `get(id)`;
  - `create(e: Omit<CalendarEvent,'id'>)`;
  - `update(id, patch)`;
  - `remove(id)`;
  - `statuses(from, to): Promise<{ eventId: number; date: string; status: 'paid'|'skipped'; source: 'auto'|'user'; transactionId: number|null }[]>`;
  - `setStatus(eventId, date, status: 'paid'|'skipped'|null, source: 'user')`;
  - `insertAutoPaid(matches: { eventId: number; date: string; transactionId: number }[]): Promise<number>` (one statement, `on conflict do nothing`);
  - `takenTransactionIds(from, to): Promise<Set<number>>`.
- **Routes:**
  - `GET /events` → `{ events }`.
  - `GET /events/occurrences?from&to` (span up to 120 days, else 400 `bad_range`) → `{ events, occurrences: { eventId, date, status, source, transactionId, payable }[] }`. Occurrences are expanded with `occurrences()` and merged with stored statuses, then sorted by date and event ID.
  - `POST /events` → 201. `PATCH /events/:id`. `DELETE /events/:id` → 204.
  - **Validation:**
    - name trimmed, 1–60 characters;
    - emoji 1–8;
    - `amountCents` null or an integer > 0;
    - `accountId` null or an existing account;
    - `startDate` a valid ISO date;
    - repeat from the enum;
    - `leadDays` 0–14;
    - `onDayAlert` boolean.
    - Failures → 400 `bad_event`, unknown ID → 404 `event_not_found`.
  - `PUT /events/:id/occurrences/:date` takes `{ status: 'paid'|'skipped'|null }`. It returns 400 `not_an_occurrence` when `!isOccurrence`, and otherwise writes a user-sourced status (null deletes it).

- [ ] **Step 1: Write the failing tests**
  - the seeded "Mortgage repayment" lists 28 Oct, 28 Nov and 28 Dec for `2026-10-01..2026-12-31`;
  - POST with an empty name → 400;
  - PUT paid on `2026-11-28` → the occurrences listing shows `status 'paid'`, `source 'user'`; PUT null clears it;
  - PUT on `2026-11-27` → 400 `not_an_occurrence`;
  - `insertAutoPaid` doesn't overwrite an existing user status;
  - a 121-day range → 400;
  - deleting an event cascades its statuses.
- [ ] **Step 2:** The tests should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** API tests and the API typecheck should both pass.
- [ ] **Step 5:** Commit `feat(api): bills and dates events API`.

### Task 5: Manual accounts API and account DTO changes

**Files:**
- Create: `apps/api/src/db/manual.ts`
- Modify: `apps/api/src/routes/accounts.ts`, `apps/api/src/db/repo.ts` (`AccountDto` gains `syncedAt: string | null`; `listAccounts` selects it)
- Test: `apps/api/test/manual-accounts.test.ts`, `apps/api/test/accounts.test.ts`

**Interfaces:**
- Consumes: `isManualStale`, `isStale` and `sydneyDate`.
- Produces: `makeManualRepo(db)` with:
  - `create({ name, icon, valueCents, asOf }): Promise<AccountDto>`, which inserts the account with the Global Constraints values and its first `account_value` in one statement;
  - `setValue(accountId, valueCents, asOf): Promise<AccountDto | null>`, which upserts `account_value` on `(account_id, as_of)`, then sets `balance_cents` and `balance_date` from the row with the latest `as_of`;
  - `values(accountId): Promise<{ asOf: string; valueCents: number }[]>` (newest first);
  - `remove(accountId): Promise<boolean>` (manual only);
  - `holdings(accountId): Promise<{ symbol: string; units: string; audCents: number }[]>` (by `aud_cents` descending).
- **Routes:**
  - `POST /accounts/manual` takes `{ name (1–60), icon (1–8 or null), valueCents (safe integer, |v| ≤ 1e12), asOf (ISO date, not after today in Sydney) }` and returns 201 `AccountDto`. Invalid input → 400 `bad_manual`.
  - `PUT /accounts/:id/value` takes `{ valueCents, asOf }`. Errors: 404 `account_not_found`, 400 `not_manual`.
  - `GET /accounts/:id/values` → `{ values }`.
  - `GET /accounts/:id/holdings` → `{ holdings }`.
  - `DELETE /accounts/:id` → 204. A non-manual account → 400 `not_manual`.
  - **`GET /accounts` gains per-account fields:**
    - `needsUpdate` = `source === 'manual' && isManualStale(balanceDate, today)`;
    - `stale` is now `pocketsmith && globalStale` OR `coinspot && isStale(syncedAt, now)`;
    - manual accounts are never stale.

- [ ] **Step 1: Write the failing tests**
  - POST "AMP super" 8,500,000 as of `2026-07-24` → the account has institution `'Manual'`, `countsSpending false`, and `needsUpdate true` when now is `2026-10-24`;
  - PUT value as of `2026-10-24` → `needsUpdate false`, and the balance is the new value;
  - PUT an older as-of value → the balance stays on the latest, and history has both newest first;
  - a future asOf → 400;
  - PUT on a PocketSmith account → 400 `not_manual`;
  - DELETE a manual account → it's gone; DELETE a PocketSmith account → 400;
  - a CoinSpot account with `synced_at` 2 days ago lists `stale true`.
- [ ] **Step 2:** The tests should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** API tests and the API typecheck should both pass.
- [ ] **Step 5:** Commit `feat(api): manual accounts with value history`.

### Task 6: CoinSpot read-only feed inside sync

**Files:**
- Create: `apps/api/src/coinspot/client.ts`
- Modify: `apps/api/src/app.ts` (`Deps` gains `coinspot?: CoinSpotClient` and `push?: PushClient`; `PushClient` is a type-only import from Task 7's path, so declare it in Task 6 as `apps/api/src/push/types.ts`), `apps/api/src/index.ts` (`Env` gains optional `COINSPOT_KEY`, `COINSPOT_SECRET` and `EXPO_ACCESS_TOKEN`; build the client only when both CoinSpot values are set), `apps/api/src/sync/runSync.ts`, `apps/api/src/db/manual.ts` (`upsertCoinspot`)
- Test: `apps/api/test/coinspot.test.ts`, `apps/api/test/sync.test.ts`

**First, verify the API shape.** Fetch `https://www.coinspot.com.au/v2/api` with WebFetch and confirm:
- the read-only balances endpoint is `POST https://www.coinspot.com.au/api/v2/ro/my/balances`;
- the body is JSON `{"nonce": <increasing integer>}`;
- the headers are `key: <key>` and `sign: <hex HMAC-SHA512 of the exact body string, keyed by the secret>`;
- the response looks like `{ "status": "ok", "balances": [ { "BTC": { "balance": 0.5, "audbalance": 30000.12, "rate": 60000.24 } }, ... ] }`.

If the live docs differ, follow the docs and ledger a `Ruling:`.

**Interfaces:**
- Produces:
  - `type CoinSpotClient = { balances(): Promise<{ symbol: string; units: string; audCents: number }[]> }`;
  - `coinSpotClient(key: string, secret: string, fetchImpl = fetch): CoinSpotClient`. It uses `crypto.subtle` HMAC-SHA512, sets the nonce to `Date.now()`, and throws `CoinSpotError(status)` on HTTP errors or `status !== 'ok'`. `audCents = Math.round(audbalance × 100)`, and `units` is `String(balance)`. Zero balances are dropped.
- `makeManualRepo(db).upsertCoinspot(holdings, now): Promise<void>` works in **2 queries**:
  1. upsert the account (`source 'coinspot'`, `external_id 'coinspot'`, institution and name `'CoinSpot'`, kind `'crypto'`, counts from `defaultCounts('crypto')`, `balance_cents = Σ audCents`, `balance_date = sydneyDate(now)`, `synced_at = now`);
  2. replace its holdings in one CTE statement.
- **Where it goes in `runSync`:** straight after the PocketSmith account upsert, when `deps.coinspot` is set and at least 5 calls are left. It costs 3 calls. Any error is caught, logged with `console.error('coinspot failed', e instanceof CoinSpotError ? e.status : 'error')`, and the run carries on. Update the budget comment.

- [ ] **Step 1: Write the failing tests**
  - **coinspot.test.ts:**
    - with a fake fetch, the sign header equals the HMAC-SHA512 hex of the body (computed in the test with `node:crypto`);
    - a balances fixture with BTC 0.5 / 30000.12, AUD 12.5 / 12.5 and ETH 0 → `[{BTC,'0.5',3000012},{AUD,'12.5',1250}]`;
    - HTTP 401 → `CoinSpotError(401)`;
    - `{status:'error'}` → throws.
  - **sync.test.ts:**
    - with a fake CoinSpot client, a run creates the CoinSpot account with balance 3,001,262 and 2 holdings;
    - a CoinSpot client that throws → the run status is `'ok'`, PocketSmith rows are still upserted, and `console.error` is called without the key;
    - no client → no CoinSpot account;
    - the call count stays ≤ `MAX_CALLS`.
- [ ] **Step 2:** The tests should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** API tests and the API typecheck should both pass.
- [ ] **Step 5:** Commit `feat(api): CoinSpot read-only balances in sync`.

### Task 7: Push devices, notification preferences and the Expo push client

**Files:**
- Create: `apps/api/src/push/types.ts` (if Task 6 didn't), `apps/api/src/push/expo.ts`, `apps/api/src/db/notify.ts`, `apps/api/src/routes/notify.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/index.ts` (`push: expoPush(env.EXPO_ACCESS_TOKEN)`)
- Test: `apps/api/test/push.test.ts`, `apps/api/test/notify-routes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PushMessage = { title: string; body: string; url: string };
  export type PushClient = { send(tokens: string[], messages: PushMessage[]): Promise<{ invalidTokens: string[] }> };
  export function expoPush(accessToken?: string, fetchImpl = fetch): PushClient;
  ```
  - It sends one POST to `https://exp.host/--/api/v2/push/send` with a JSON array of `{ to, title, body, data: { url }, sound: 'default', channelId: 'default' }`, one per token × message, capped at 100.
  - It adds `Authorization: Bearer <token>` when an access token is given.
  - Tickets with `status 'error'` and `details.error 'DeviceNotRegistered'` add their `to` to `invalidTokens`.
  - A non-2xx response throws `PushError(status)`.
- Produces: `makeNotifyRepo(db)` with:
  - `devices(): Promise<string[]>`;
  - `addDevice(token)`;
  - `removeDevices(tokens)`;
  - `prefs(): Promise<Record<NotificationType, boolean>>`;
  - `setPrefs(patch)`;
  - `claimKeys(keys: string[]): Promise<Set<string>>` (`insert … on conflict do nothing returning key`, one query);
  - `releaseKeys(keys)`.
- **Routes:**
  - `POST /push/devices` takes `{ token }`, which must match `/^ExponentPushToken\[[A-Za-z0-9_-]+\]$/` (else 400 `bad_token`), and returns 204.
  - `GET /notifications/prefs` → the prefs record.
  - `PUT /notifications/prefs` takes a partial record of booleans. Unknown keys → 400 `bad_prefs`.
  - `POST /notifications/test` sends `{ title: 'Test notification', body: 'Notifications are working', url: '/notifications' }` to every device. It returns 200 `{ sent: n }`, or 409 `no_devices`. It writes no log.

- [ ] **Step 1: Write the failing tests**
  - **push.test.ts:**
    - the body has one entry per token × message;
    - the Authorization header is present only with a token;
    - a `DeviceNotRegistered` ticket is reported;
    - a 500 response throws.
  - **notify-routes.test.ts:**
    - a bad token → 400;
    - adding the same token twice keeps one row;
    - setting `bill: false` then GET shows it;
    - `{ foo: true }` → 400;
    - the test route with no devices → 409, and with a fake push client → `sent 1` and the message copy;
    - `claimKeys` returns only keys that are new.
- [ ] **Step 2:** The tests should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** API tests and the API typecheck should both pass.
- [ ] **Step 5:** Commit `feat(api): push devices, notification prefs, Expo push client`.

### Task 8: Hourly alerts job: auto-paid bills and notifications

**Files:**
- Create: `apps/api/src/alerts/runAlerts.ts`
- Modify: `apps/api/src/index.ts` (`scheduled(event)` runs `runAlerts` when `event.cron === '7 * * * *'`, otherwise the existing sync path), `apps/api/wrangler.toml` (`crons = ["*/15 * * * *", "7 * * * *"]`; comment that secrets now include the optional `COINSPOT_KEY`, `COINSPOT_SECRET` and `EXPO_ACCESS_TOKEN`)
- Test: `apps/api/test/alerts.test.ts`, `apps/api/test/scheduled.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5 and 7.
- Produces: `runAlerts(deps: Deps): Promise<{ matched: number; sent: number }>`.

**Steps of `runAlerts`.** This is a separate invocation with its own budget. Count calls through a wrapped `Db`, the same way `runSync` does, with a limit of 30.
1. Set `today = sydneyDate(now)`. Load the events, the statuses for `[today−40, today+3]`, the taken transaction IDs, and the outflow candidates dated `[today−43, today]`. The candidates come from a new `makeEventsRepo(db).paymentCandidates(from, to)` (one query: id, account_id, date, amount_cents, merchant, description_raw).
2. Build the due occurrences without a status from `occurrences(e, today−40, today)` for payable events. Run `matchPayments`, then `insertAutoPaid`.
3. Load the limits, the month's `spendLines` and the categories. Compute `limitStatuses` with labels: the category name, or `WHOLE_MONTH_LABEL`.
4. Load `lastSuccessfulSync`, the manual accounts from `listAccounts`, the prefs and the devices.
5. Run `planNotifications`, with occurrences covering `[today−30, today+14]` and statuses merged in, including the paid rows just inserted.
6. If there are no devices, stop: return `sent: 0` without claiming keys.
7. Claim every planned key. Send only the notifications with at least one newly claimed key. If the send throws, release the newly claimed keys and rethrow. Remove the `invalidTokens`.

Errors are logged by `scheduled` as `console.error('alerts failed', status)` with no message text.

- [ ] **Step 1: Write the failing tests** (PGlite, fake push, fixed `now` `2026-10-24T22:30:00Z`, a successful `sync_log` row finished an hour earlier so no sync notification fires unless a test wants one)
  - a payable "Internet" event (8,900, monthly from `2026-10-20`) and a −8,900 transaction on `2026-10-21` → after the run, `2026-10-20` is `paid`/`auto` with that transaction ID, and no "Did this get paid?" is sent;
  - without that transaction → one "Did this get paid?" is sent; a second run sends nothing (keys claimed);
  - a Groceries limit at 92% → one 'Spending limit' push with body `'Groceries is at 92% of your limit'`;
  - when the fake push throws → the run rejects, `notification_log` is empty afterwards, and the next run with a working push sends it;
  - no devices → `sent 0`, and `notification_log` stays empty;
  - a `DeviceNotRegistered` response removes the token;
  - the counted calls are ≤ 20;
  - **scheduled.test.ts:** `cron '7 * * * *'` calls `runAlerts` and not `runSync`; `'*/15 * * * *'` keeps the sync behaviour.
- [ ] **Step 2:** The tests should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** API tests and the API typecheck should both pass.
- [ ] **Step 5:** Commit `feat(api): hourly alerts job with auto-paid bills and push`.

### Task 9: Plan 3 follow-ups: transfer unpairing and inbox double accept

**Files:**
- Modify: `apps/api/src/db/repo.ts` (`patchTransaction`), `apps/mobile/app/inbox.tsx`
- Test: `apps/api/test/transactions.test.ts`, `apps/mobile/__tests__/inbox.test.tsx`

**Requirements:**
- **Transfer unpairing.** When `patchTransaction` changes the flow of a row that has a `pair_id`, in the same query:
  - clear its `pair_id`;
  - set the partner to `flow = 'normal'`, `flow_source = 'auto'`, `pair_id = null`, unless the partner's `flow_source` is `'user'`;
  - set `categorised = false` on the partner, so the next pipeline run re-detects it.

  This is from the deferred-minors list in `docs/superpowers/plans/2026-10-24-plan-3-deferred-minors.md`, Task 6: "PATCH flow clears pair_id on one side only".
- **Inbox double accept.** The inbox ignores a second accept or skip on a card while that card's mutation is pending. The test fires accept twice quickly and the update mutation is called once.

- [ ] **Step 1:** Write both failing tests.
  - **API:** pair A (−5,000, account 1) with B (+5,000, account 2) through the pipeline. PATCH A to flow `'normal'`. Then A has flow `normal`/`user` and `pair_id` null, and B has `normal`/`auto` and `pair_id` null.
  - **Mobile:** the inbox test above.
- [ ] **Step 2:** Run them and watch them fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The API suite, the mobile `inbox` tests and both typechecks should pass.
- [ ] **Step 5:** Commit `fix: unpair transfer partner on flow edit; guard inbox double accept`.

### Task 10: Mobile limits: Limits screen, Home warning chip, Spending markers

**Files:**
- Create: `apps/mobile/app/limits.tsx`, `apps/mobile/src/components/Chip.tsx`, `apps/mobile/src/components/LimitSheet.tsx`
- Modify: `apps/mobile/src/api/types.ts`, `apps/mobile/src/api/hooks.ts` (`useLimits(month)`, `useCreateLimit`, `useUpdateLimit`, `useDeleteLimit`, all invalidating `['limits']`), `apps/mobile/app/_layout.tsx` (Stack screen `limits`, `headerShown: false`; Tasks 11–14 each add their own screen the same way: `calendar`, `event/[id]`, `account/new`, `notifications`), `apps/mobile/src/components/CategoryBar.tsx` (optional `limitFraction?: number` draws a 2px dashed vertical `ink` marker at that fraction), `apps/mobile/app/(tabs)/spending.tsx`, `apps/mobile/app/(tabs)/index.tsx`
- Test: `apps/mobile/__tests__/limits.test.tsx`, `spending-tab.test.tsx`, `accounts-tab.test.tsx`, `components.test.tsx`

**Requirements** (mockup 08, right side):
- **Limits screen:**
  - Back link `'‹ More'`, title `'Spending limits'`, muted line `"We'll ping you at your warning level and at 100%."`.
  - **Whole-month limit:** a `HeroCard` with label `'Whole month'`, `<Amount spent> / <Amount limit>`, and `` `${percent}% · ${daysLeft} days left` ``, where `daysLeft` = the last day of the Sydney month − today's day of the month, and it reads `'1 day left'` when 1.
  - **No whole-month limit:** a dashed card `'+ Set a whole-month limit'`.
  - **Category limit rows:**
    - emoji tile, name, `<Amount spent> / <Amount limit>`;
    - a bar filled to `min(1, percent/100)` with a dashed marker at `warnPercent/100`;
    - the line `` `${percent}%` ``, plus `` ` · alerted ${dayMonthLabel}` `` when `alertedAt` is set;
    - a `Pill` `'CLOSE'` at `warn`, and `'OVER'` at `over`.
  - A dashed button `'+ Add a limit'`, and a footer `'dashed line = warning level'`.
- **LimitSheet:**
  - Category: `CategoryPicker`, spending categories only, excluding ones that already have a limit. Hidden when editing, or for the whole-month limit.
  - Amount (`parseDecimalToCents`).
  - Warning: `Segmented` with 70% / 80% / 90%.
  - Save; and Delete (`'Delete limit'`) when editing.
  - Errors in plain text: `'Enter an amount above $0'`, `'That category already has a limit'` (409).
- **Home:** inside the hero card, a `Chip` (dark `#16131f` pill, lime text) with `limitMessage(label, percent)` for the highest-percent limit at `warn` or `over`. When more than one is, append `` ` · +${n} more` ``. Tapping it opens `/limits`. There's no chip when nothing is at warn or over.
- **Spending tab** (only when the institution filter is All):
  - The bar scale becomes `max(largest category cents, largest limit among the shown categories)`. Each category with a limit gets `limitFraction = limit / scale`.
  - Under the total, one plain-text line per `warn` or `over` limit with `limitMessage(...)`.
- Add a `CategoryBar` test: a `limitFraction` of 0.5 renders a marker with `left: '50%'`.

- [ ] **Step 1:** Write the failing tests:
  - the Limits screen renders the whole-month hero with `'82% · 7 days left'` (mock now 2026-10-24) and a 'CLOSE' pill for a warn row;
  - the add sheet posts `{categoryId, amountCents: 95000, warnPercent: 80}`;
  - the Home chip shows `'Dining out is at 92% of your limit · +1 more'`;
  - the Spending tab shows the warning line and passes `limitFraction`;
  - with the institution set to Amex, there are no markers or lines.
- [ ] **Step 2:** Run the focused tests and watch them fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The focused tests, the full mobile suite and the mobile tsc should pass.
- [ ] **Step 5:** Commit `feat(mobile): spending limits screen, home chip, limit markers`.

### Task 11: Mobile calendar: month grid, coming up, paid prompt, Home upcoming

**Files:**
- Create: `apps/mobile/app/calendar.tsx`, `apps/mobile/src/components/MonthGrid.tsx`, `apps/mobile/src/components/PaidSheet.tsx`, `apps/mobile/src/components/UpcomingEvents.tsx`
- Modify: `apps/mobile/src/api/types.ts`, `apps/mobile/src/api/hooks.ts` (`useOccurrences(from, to)`, `useSetOccurrence`, invalidating `['occurrences']`), `apps/mobile/app/(tabs)/index.tsx`
- Test: `apps/mobile/__tests__/calendar.test.tsx`, `apps/mobile/__tests__/month-grid.test.tsx`, `accounts-tab.test.tsx`

**Requirements** (mockup 04, left side):
- **`MonthGrid({ month, today, dots: Record<string, string[]>, selected?, onSelect? })`:**
  - Monday-first, with `M T W T F S S` headers.
  - Today has an orange circle. Past days use `inkFaded`.
  - Up to 3 dots per day, coloured with `accents` cycled by event ID.
  - With `onSelect`, days are pressable buttons labelled `dayLabel(iso)`. It's also used as a date picker in Tasks 12 and 13.
- **Calendar screen:**
  - Back link `'‹ More'`, title `'Bills & dates'`, then the `MonthSwitcher` and the `MonthGrid` for the viewed month.
  - **"Coming up":** occurrences dated today or later in the viewed month, plus the next 14 days when the viewed month is the current one. Each row has an emoji tile, the name, and a subline: `` `${dayLabel} · today` ``, `'· tomorrow'`, or `` `· in ${n} days` `` when 7 days or less away, otherwise `` `· ${REPEAT_LABEL[repeat]}` ``. A right-aligned `<Amount>` shows when the event has an amount.
  - **"Earlier this month":** past occurrences in the viewed month. The subline is `'matched to transaction'` (auto paid), `'marked paid'` (user paid), `'skipped'`, or `REPEAT_LABEL`. Payable rows get a `'PAID'` lime pill when paid, and a `'PAID?'` pink pill when unpaid with the date passed.
  - Tapping a payable past row opens the `PaidSheet`. Tapping any other row opens `/event/{id}`.
  - A lime floating action button, 52×52 with radius 18, labelled `'Add event'`, goes to `/event/new`.
  - The `?ask=EVENTID:DATE` parameter opens the PaidSheet for that occurrence when the screen loads.
- **PaidSheet:**
  - Title `'Did this get paid?'`, subline `` `${name} · due ${dayLabel(date)}` ``.
  - Buttons `"Yes, it's paid"` (status paid), `'Not yet'` (closes), `'Skip this one'` (skipped).
  - When the occurrence is already paid, also `'Mark as not paid'` (null).
- **Home:** `UpcomingEvents` shows the next 2 occurrences with a null status dated today or later, within 60 days. Rows look like "Coming up" rows, under the label `'Coming up'`, and tapping goes to `/calendar`. Nothing renders when there are none.

- [ ] **Step 1:** Write the failing tests:
  - **month-grid:** October 2026 starts on a Thursday (3 blank cells), today has the highlight style, and `onSelect` fires with `'2026-10-27'`;
  - **calendar:** with mocked occurrences, "Internet · in 3 days" and "Netflix · matched to transaction · PAID" show; tapping a PAID? row and pressing "Yes, it's paid" calls the mutation with `{eventId, date, status:'paid'}`; `?ask=` opens the sheet;
  - **accounts-tab:** Home shows two upcoming rows.
- [ ] **Step 2:** Run the focused tests and watch them fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The focused tests, the full mobile suite and the mobile tsc should pass.
- [ ] **Step 5:** Commit `feat(mobile): bills and dates calendar with paid prompt`.

### Task 12: Mobile event editor

**Files:**
- Create: `apps/mobile/app/event/[id].tsx`
- Modify: `apps/mobile/src/api/hooks.ts` (`useEvents`, `useCreateEvent`, `useUpdateEvent`, `useDeleteEvent`, invalidating `['occurrences']` and `['events']`)
- Test: `apps/mobile/__tests__/event-editor.test.tsx`

**Requirements** (mockup 04, right side). `id` is `'new'` or a number.
- **Header:** `'Cancel'` · title (`'New event'` or `'Edit event'`) · `'Save'`.
- **Fields, in order:**
  - **Name.**
  - **Amount (optional).**
  - **Icon:** `EmojiPicker`, default `'📅'`.
  - **First date:** shows `fullDay`, and tapping opens a `MonthGrid` picker in a `Sheet`. The default is today.
  - **Repeats** pills: `Never`, `Weekly`, `Fortnightly`, `Monthly`, `Quarterly`, `Yearly`, mapping to the `Repeat` values. The default is Monthly.
  - **Remind me** pills: `On the day` (lead 0), `1 day`, `2 days`, `1 week before` (7). The default is 2 days.
  - **A Toggle `'Also remind me on the day'`**, shown when the lead is above 0.
  - **Paid from (optional, for auto-tick):** account chips for `countsSpending` accounts, plus `'None'`.
- When an amount or an account is set, show the Caveat `HandNote` `"we'll tick it off when the payment shows up"`.
- `'Delete event'` (secondary) when editing.
- **Validation:** an empty name shows `'Give it a name'`. A bad amount shows `'Enter an amount above $0'`.
- After saving or deleting, go back.

- [ ] **Step 1:** Write the failing tests:
  - filling the name "Strata levy", amount "1150", Quarterly, "1 week before" and Save posts `{name:'Strata levy', emoji:'📅', amountCents:115000, accountId:null, startDate:<today>, repeat:'quarterly', leadDays:7, onDayAlert:false}`;
  - editing a seeded event pre-fills its fields and PATCHes;
  - an empty name shows the error and makes no call;
  - Delete calls the delete mutation.
- [ ] **Step 2:** Run the focused tests and watch them fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The focused tests, the full mobile suite and the mobile tsc should pass.
- [ ] **Step 5:** Commit `feat(mobile): event editor`.

### Task 13: Mobile manual accounts and the CoinSpot account

**Files:**
- Create: `apps/mobile/app/account/new.tsx`, `apps/mobile/src/components/ValueSheet.tsx`
- Modify: `apps/mobile/src/api/types.ts` (`AccountKind` gains `'crypto'`; `Account` gains `source` including `'coinspot'`, `needsUpdate`, `syncedAt`), `apps/mobile/src/api/hooks.ts` (`useCreateManualAccount`, `useSetAccountValue`, `useAccountValues(id)`, `useHoldings(id)`, `useDeleteAccount`), `apps/mobile/src/components/AccountRow.tsx` (`kindEmoji.crypto = '🪙'`, `kindColor.crypto = accents.orange`; a `Pill tone="warn"` `'update?'` when `needsUpdate`), `apps/mobile/app/(tabs)/index.tsx` (`ORDER` = `['CommBank','Amex','Up','CommSec','CoinSpot','Manual']`; a dashed card `'+ Add super or home value'` at the end of the list goes to `/account/new`), `apps/mobile/app/account/[id].tsx`, `apps/mobile/app/account/[id]/settings.tsx` (a `'Delete this account'` button for manual accounts, with a confirming `Sheet` `'Delete AMP super? Its value history goes too.'` and `Delete` / `Cancel`)
- Test: `apps/mobile/__tests__/manual-account.test.tsx`, `account-detail.test.tsx`, `accounts-tab.test.tsx`, `account-settings.test.tsx`

**Requirements:**
- **Add manual account screen:**
  - Title `'Add a manual account'`.
  - Fields: Name (placeholder `'AMP super'`), Icon (default `'🦘'`), Value, As of (default today; opens the MonthGrid picker; dates after today are disabled).
  - The Caveat note `'super stays out of your spending, promise'`.
  - `'Save'` posts, then replaces the route with `/account/{id}`.
  - Errors: `'Give it a name'`, `'Enter a value'`, and `"As of can't be in the future"`.
- **Account detail for a manual account:**
  - Instead of the pager: a value card with `<Amount>` and the muted `` `as of ${dayMonthLabel}` ``, and the warn pill `'Time to update'` when `needsUpdate`.
  - A `'Update value'` button opens the `ValueSheet` (value plus as-of).
  - A `'History'` list of values, with the date and `<Amount>`.
- **Account detail for CoinSpot:** a holdings list with a symbol tile, units (muted) and `<Amount audCents>`. Footer: `` `Values from CoinSpot · updated ${receivedLabel(syncedAt)}` ``.
- Other account kinds are unchanged.

- [ ] **Step 1:** Write the failing tests:
  - adding "AMP super" 85000.00 as of today posts `{name:'AMP super', icon:'🦘', valueCents:8500000, asOf:<today>}`;
  - a manual detail shows 'Time to update' and the history;
  - 'Update value' posts `PUT /accounts/7/value`;
  - a CoinSpot detail lists BTC and AUD holdings;
  - the Accounts tab places the CoinSpot and Manual groups last, with an 'update?' pill;
  - the settings delete flow calls `useDeleteAccount`.
- [ ] **Step 2:** Run the focused tests and watch them fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The focused tests, the full mobile suite and the mobile tsc should pass.
- [ ] **Step 5:** Commit `feat(mobile): manual accounts and CoinSpot holdings`.

### Task 14: Mobile push notifications

**Files:**
- Install: `cd apps/mobile && npx expo install expo-notifications`
- Create: `apps/mobile/app.config.js`, `apps/mobile/src/notifications/register.ts`, `apps/mobile/src/notifications/useNotificationRouting.ts`, `apps/mobile/app/notifications.tsx`
- Modify: `apps/mobile/app.json` (add the `"expo-notifications"` plugin), `apps/mobile/app/_layout.tsx` (call `useNotificationRouting()` inside `AppStack`), `apps/mobile/src/api/hooks.ts` (`useNotificationPrefs`, `useSetNotificationPrefs`, `useRegisterDevice`, `useTestNotification`), `apps/mobile/jest.setup.js` (mock `expo-notifications`), the root `.gitignore` (`apps/mobile/google-services.json`)
- Test: `apps/mobile/__tests__/notifications.test.tsx`, `apps/mobile/__tests__/app-config.test.ts`

**Requirements:**
- **`app.config.js`:** `module.exports = ({ config }) => ({ ...config, android: { ...config.android, googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json' } });`
- **`registerForPush(conn)`:**
  1. Set the Android channel `'default'` (name `'Default'`, importance `DEFAULT`).
  2. Request permission. When it's denied, return `'denied'`.
  3. Get `getExpoPushTokenAsync({ projectId: Constants.expoConfig.extra.eas.projectId })`.
  4. `POST /push/devices`.
  5. Return `'registered'`.
- **The foreground handler** shows the banner and list entry, and plays a sound.
- **`useNotificationRouting`:** on a notification response, push `data.url` only when it's a string starting with `/`. It also handles the response that launched the app (`getLastNotificationResponseAsync`).
- **Notifications screen:**
  - Back link `'‹ More'`, title `'Notifications'`.
  - A status card: `'Notifications are on'` / `'Notifications are off'`, with a `'Turn on notifications'` button when they're off or not yet asked. `'Allow notifications in Android settings'` shows when permission was denied.
  - Toggles with sublines:
    - `'Spending limits'` · `'At your warning level and at 100%'`;
    - `'Bills & dates'` · `'Before each event, and on the day if you ask'`;
    - `'Did this get paid?'` · `"When a bill's payment doesn't show up"`;
    - `'Bank sync problems'` · `"When accounts haven't updated for 36 hours"`;
    - `'Manual values'` · `'When super or home value is 3 months old'`.
  - `'Send a test notification'`, and the plain-text error `'Turn on notifications first'` on 409.
- Re-register on app start when permission is already granted, since tokens can rotate. This is quiet, with no prompt.

- [ ] **Step 1:** Write the failing tests:
  - **app-config:** with the env var set, `googleServicesFile` equals it; unset, it's `'./google-services.json'`;
  - **notifications:**
    - "Turn on notifications" with granted permission posts the token;
    - with denied permission it shows the Android settings line and posts nothing;
    - toggling "Bills & dates" PUTs `{bill:false}`;
    - the routing hook pushes `'/calendar'` for a response with `url '/calendar'`, and ignores `'https://evil'`.
- [ ] **Step 2:** Run the focused tests and watch them fail.
- [ ] **Step 3:** Implement. `npx expo install --check` should come back clean.
- [ ] **Step 4:** The focused tests, the full mobile suite and the mobile tsc should pass.
- [ ] **Step 5:** Commit `feat(mobile): push notifications and preferences`.

### Task 15: More tab restructure

**Files:**
- Modify: `apps/mobile/app/(tabs)/more.tsx`
- Test: `apps/mobile/__tests__/more.test.tsx`

**Requirements** (mockup 08, left side). Title `'More'`, then grouped rows, each with an emoji tile, a label, an optional muted subline and `›`. Every row is a link.
- **No heading:**
  - 📅 `'Bills & dates'`, subline `` `${n} coming up this week` `` (null-status occurrences in the next 7 days; `'Nothing this week'` when 0) → `/calendar`;
  - ⬆ `'Import'`, subline `'CommBank or Amex CSV'` → `/import`.
- **`'Money settings'`:**
  - 🚦 `'Spending limits'`, subline `'Monthly + N categories'`, `'N categories'`, `'Monthly'` or `'None set'` → `/limits`;
  - 🪄 `'Rules'`, subline `` `${autoPercent}% auto-sorted` `` when known → `/rules`;
  - 🦘 `'Add super or home value'` → `/account/new`.
- **`'App'`:**
  - 🔔 `'Notifications'` → `/notifications`;
  - ⚙️ `'Settings'` → `/settings`;
  - 🎨 `'Design system'` → `/design-system`.

Settings keeps its Rules row too.

- [ ] **Step 1:** Write the failing test: every label and its route, and the sublines from mocked hooks (`'2 coming up this week'`, `'Monthly + 3 categories'`).
- [ ] **Step 2:** Watch it fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The focused test, the full mobile suite and the mobile tsc should pass.
- [ ] **Step 5:** Commit `feat(mobile): More tab with bills, limits and notifications`.

### Task 16: Deploy, owner setup, APK and device checks

**Files:**
- Modify: `README.md` ("Backend setup": the new optional secrets and the alerts cron; a new "Push notifications setup" section with the owner steps below)

The controller does this task with the owner. Run nothing that needs their secrets.

- [ ] **Step 1:** Run the whole suite: core, API, mobile, three typechecks and `expo install --check`. Everything should be green.
- [ ] **Step 2:** Write the README sections. Then commit `docs: Plan 4 setup — CoinSpot, Firebase push, alerts cron`.
- [ ] **Step 3: Owner steps, in order.** Give these to the owner. They paste no secret into chat.
  1. Create a backup branch in Neon.
  2. From `apps/api`, set the connection string with `$env:DATABASE_URL = Read-Host "Neon connection string"`, run `node scripts/migrate.mjs` and expect `applied 0005_planner.sql`, then run `Remove-Item Env:DATABASE_URL`.
  3. **CoinSpot:** in Profile → API, create a **Read Only** key and confirm the email. Then run `npx wrangler secret put COINSPOT_KEY` and `npx wrangler secret put COINSPOT_SECRET`, pasting the values at the prompt.
  4. **Firebase:**
     1. At console.firebase.google.com, add a project `curly-journey` with Analytics off.
     2. Add an Android app with package `com.curlyjourney.app`.
     3. Download `google-services.json` to `apps/mobile/google-services.json`. It's gitignored.
     4. From `apps/mobile`, run `npx eas-cli env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment preview --visibility secret`.
     5. In Firebase, go to Project settings → Service accounts → Generate new private key. Upload it with `npx eas-cli credentials`: Android → preview → Google Service Account → FCM V1.
     6. Delete the downloaded key file afterwards.
  5. **Expo push security:**
     1. At expo.dev, go to Account → Access tokens and create `curly-journey-push`.
     2. In the project settings, turn on "Enhanced security for push notifications".
     3. Run `npx wrangler secret put EXPO_ACCESS_TOKEN`.
  6. Run `npx wrangler deploy`. Then watch `npx wrangler tail --format pretty` through one sync and one `:07` alerts run.
  7. From `apps/mobile`, run `npx eas-cli build -p android --profile preview`, and install the APK.
- [ ] **Step 4: Phone checks.**
  - More → Notifications → Turn on → Send a test notification. It arrives, and tapping it opens Notifications.
  - Add a Groceries limit below this month's spend. Within the hour, a "Spending limit" push arrives, the Home chip shows, and the Spending tab has a marker.
  - Calendar shows the seeded Mortgage (28th) and Amex (25th) events.
  - Edit Mortgage to add an amount and the Everyday Offset account. After the next payment, it shows PAID.
  - Add a test event due tomorrow with "1 day". A reminder arrives after 09:00.
  - Add AMP super. It appears under Manual and is excluded from the spending totals.
  - CoinSpot appears with a balance that matches the CoinSpot app (±price movement) and its coins.
  - Inbox: a fast double swipe accepts once.
- [ ] **Step 5:** Record the results in the ledger.

## Not in this plan

These belong to Plan 5 and later:
- the net worth screen, its Home row and snapshots;
- the CommSec import and its trade hint;
- ETF prices;
- projections;
- renaming, recolouring and deleting categories;
- editing rules;
- a notification history screen.
