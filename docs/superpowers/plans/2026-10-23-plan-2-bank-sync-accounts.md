# Plan 2: Bank Sync and Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real CommBank, Amex and Up accounts and transactions appear in the app. They're synced from PocketSmith every 4 hours and on pull-to-refresh, backfilled from bank CSV exports, and every account has its "counts towards" switches and offset flag.

**Architecture:**
- **New `apps/api`:** a Cloudflare Worker (Hono, TypeScript) that is the only thing allowed to touch the Neon Postgres database. It holds the PocketSmith key and runs the sync on a Workers cron trigger.
- **Pure logic in `packages/core`:** CSV parsing, de-duplication, PocketSmith mapping and staleness, all unit-tested.
- **Data access:** the Worker talks to Postgres through a small `Db` interface. In production it's backed by Neon's serverless driver; in tests it's backed by PGlite (Postgres compiled to WASM), so the SQL is tested for real.
- **Mobile app:** talks to the Worker over HTTPS with a bearer token kept in secure storage.

**Tech Stack:**
- Worker: Hono, `@neondatabase/serverless`, `wrangler`
- Tests: `@electric-sql/pglite`, Vitest
- Mobile: `@tanstack/react-query`, `expo-secure-store`, `expo-document-picker`
- Shared: `packages/core` (from Plan 1)

**Spec:** `docs/superpowers/specs/2026-10-22-curly-journey-v1-design.md` (§5, §7, §8, §9.1–9.2, §9.8 toggles, §9.12, §9.13) and `docs/superpowers/specs/2026-10-22-curly-journey-v1-visual-design.md` (§5, §8a, screen 1). Executors read both.

## Global Constraints

- Everything from Plan 1's Global Constraints still applies: integer cents, `Australia/Sydney` months, true minus sign, `<Amount>` for all money, hide balances.
- **The database is never reachable from the phone.** Only the Worker holds `DATABASE_URL`, as a Worker secret.
- **Secrets live only in Worker secrets:** `DATABASE_URL` and `POCKETSMITH_KEY`. They are never in the repo, `wrangler.toml`, the APK or logs.
- **Auth:** `Authorization: Bearer <token>` on every route except `GET /health`. Tokens look like `cj_` + 32 random bytes in base64url. Only the SHA-256 hex of a token is stored. Return 401 with no body detail.
- **Sync:** PocketSmith API v2 with the `X-Developer-Key` header. Cron is `0 */4 * * *`. Incremental via `updated_since` = start time of the last successful sync minus 1 hour. Upsert on `(source, external_id)`.
- **Balances come from the feed** (`current_balance`), never computed from transactions.
- **Stale** means no successful sync for more than **36 hours**. A stale account keeps its last balance and still counts in totals.
- **Default "counts towards" switches by account kind** (spec §9.8):
  - transaction, savings, credit_card: spending on, net worth on, projections off;
  - mortgage: off, on, `mortgage`;
  - brokerage: off, on, `etf`;
  - manual_asset: off, on, off.
- **CSV import de-duplication:** a row is a duplicate when it has the same account, the same `amount_cents`, a date within ±2 days, and normalised descriptions that share their first 8 alphanumeric characters. Re-importing the same file must add 0 rows.
- **Out of scope here** (Plan 3): categories, transfer detection, spending totals, the Categories page and the Amex statement toggle. Plan 2 shows each account's balance and its transactions by month.

## Review Focus

1. **PocketSmith paginates.** An account with more than one page of transactions must sync every page; the client follows the `Link: rel="next"` header. Pinned in Task 5.
2. **A sync that fails halfway** must record `failed` in `sync_log`, keep earlier balances, and not advance `updated_since`. The next run must re-fetch the missed window. Pinned in Task 5.
3. **Overlapping syncs** (cron and pull-to-refresh at the same moment). The second call must return `409 sync_in_progress` and must not double-insert. Pinned in Task 5.
4. **CSV quirks:**
  - thousands separators (`"1,234.56"`);
  - leading `+`;
  - Amex's positive-means-charge sign convention;
  - blank trailing lines;
  - a byte-order mark at the start of the file;
  - the same transaction twice in one file (two coffees, same day, same amount) must import as **two** rows.

  Pinned in Task 1.
5. **A lost or wrong token on the phone** must send the app back to the Connect screen, not into an error loop. Pinned in Task 7.

## File map

```
packages/core/src/import/money.ts          parseDecimalToCents
packages/core/src/import/csv.ts            parseCsv (RFC 4180-ish, BOM-safe)
packages/core/src/import/commbank.ts       parseCommBankCsv
packages/core/src/import/amex.ts           parseAmexCsv
packages/core/src/import/dedupe.ts         normaliseDescription, isLikelyDuplicate, rowFingerprints
packages/core/src/sync/pocketsmith.ts      PocketSmith types + mapAccount, mapTransaction, defaultCounts
packages/core/src/sync/staleness.ts        STALE_AFTER_MS, isStale
packages/core/test/{import,sync}/*.test.ts + fixtures/*.csv

apps/api/
  package.json, tsconfig.json, wrangler.toml, vitest.config.ts
  migrations/0001_init.sql
  scripts/migrate.mjs                      applies migrations/*.sql in order, records them
  scripts/create-token.mjs                 prints a new token once, inserts its hash
  src/index.ts                             Worker entry: fetch = app.fetch, scheduled = runSync
  src/app.ts                               Hono app factory createApp(deps)
  src/auth.ts                              hashToken, bearerAuth middleware
  src/db/db.ts                             Db interface + neonDb(url)
  src/db/repo.ts                           Repo (all SQL lives here)
  src/pocketsmith/client.ts                PocketSmithClient (fetch, pagination)
  src/sync/runSync.ts                      runSync(deps, now)
  src/routes/{accounts,sync,imports}.ts
  test/helpers.ts                          pgliteDb(), seed helpers, fakePocketSmith
  test/*.test.ts

apps/mobile/
  src/api/connection.ts                    SecureStore load/save/clear of { url, token }
  src/api/client.ts                        apiFetch, ApiError, UnauthorizedError
  src/api/hooks.ts                         react-query hooks
  src/api/QueryProvider.tsx
  app/connect.tsx                          setup: API URL + token
  app/(tabs)/index.tsx                     Accounts tab (real)
  app/account/[id].tsx                     account detail
  app/account/[id]/settings.tsx            counts-towards switches, offset flag, display name
  app/import.tsx                           CSV import flow
  src/components/SyncBanner.tsx, AccountRow.tsx, TransactionRow.tsx
```

---

### Task 1: CSV parsing and de-duplication (core)

**Files:**
- Create: `packages/core/src/import/{money,csv,commbank,amex,dedupe}.ts`
- Create fixtures: `packages/core/test/fixtures/commbank.csv`, `amex.csv`
- Test: `packages/core/test/import/*.test.ts`
- Export everything from `src/index.ts`

**Interfaces (Produces):**
```ts
type ImportedRow = { date: string /* YYYY-MM-DD */; amountCents: Cents /* negative = money out */; description: string };
parseDecimalToCents(s: string): Cents            // "+1,234.56" → 123456, "-84.2" → -8420; throws RangeError on junk
parseCsv(text: string): string[][]               // strips BOM, handles quoted commas/quotes, drops blank lines
parseCommBankCsv(text: string): ImportedRow[]    // no header: date(dd/mm/yyyy), amount, description, balance
parseAmexCsv(text: string): ImportedRow[]        // header row; columns found by name: Date, Description, Amount; Amount is positive for charges → negate
normaliseDescription(s: string): string          // uppercase, keep A–Z0–9 only
isLikelyDuplicate(a: ImportedRow, b: ImportedRow): boolean   // same amountCents, |date diff| ≤ 2 days, first 8 chars of normalised descriptions equal
rowFingerprints(rows: ImportedRow[]): string[]   // `${date}|${amountCents}|${normalised}|${n}` where n = occurrence index of that triple in the file
```

- [ ] **Step 1: Write fixtures and failing tests.**
  - `commbank.csv` contents:
    - a BOM;
    - `22/10/2026,"-84.20","WOOLWORTHS 1234 SYDNEY AU Card xx1234","+6,240.00"`;
    - two identical `"-4.50","KIOSK 22 SYD"` rows on 21/10/2026;
    - a salary row `+4,700.00`;
    - a trailing blank line.
  - `amex.csv` contents:
    - a header `Date,Date Processed,Description,Card Member,Account #,Amount`;
    - a charge `20/10/2026,...,MR WONG SYDNEY,...,146.00`;
    - a payment `-2,530.00`.
  - Tests:
    ```ts
    expect(parseDecimalToCents('+1,234.56')).toBe(123456);
    expect(parseDecimalToCents('-84.2')).toBe(-8420);
    expect(() => parseDecimalToCents('abc')).toThrow(RangeError);
    const cba = parseCommBankCsv(read('commbank.csv'));
    expect(cba[0]).toEqual({ date: '2026-10-22', amountCents: -8420, description: 'WOOLWORTHS 1234 SYDNEY AU Card xx1234' });
    expect(cba).toHaveLength(4);                       // blank line dropped, both coffees kept
    const amex = parseAmexCsv(read('amex.csv'));
    expect(amex.find(r => r.description.startsWith('MR WONG'))!.amountCents).toBe(-14600);   // charge → money out
    expect(amex.find(r => r.amountCents > 0)!.amountCents).toBe(253000);                     // payment → money in
    const fps = rowFingerprints(cba);
    expect(new Set(fps).size).toBe(4);                 // the two coffees get distinct fingerprints
    expect(isLikelyDuplicate({ date: '2026-10-22', amountCents: -8420, description: 'WOOLWORTHS 1234 SYDNEY' },
                             { date: '2026-10-21', amountCents: -8420, description: 'Woolworths 1234 Sydney AU' })).toBe(true);
    expect(isLikelyDuplicate({ date: '2026-10-22', amountCents: -8420, description: 'WOOLWORTHS' },
                             { date: '2026-10-25', amountCents: -8420, description: 'WOOLWORTHS' })).toBe(false); // 3 days apart
    ```
- [ ] **Step 2: Run the tests.** `npm test -w @curly/core`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement.** `parseDecimalToCents` must parse the string itself (strip `,`, sign, split on `.`, pad cents) and never go through float multiplication. Dates `dd/mm/yyyy` become `yyyy-mm-dd`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Check the format against your real exports.** If you've provided CommBank and Amex exports, compare their first lines (with amounts masked) against the fixtures. Where they differ, update the fixture and parser, and ledger a Ruling. If you haven't, ledger `Ruling: parsers built against assumed formats`.
- [ ] **Step 6: Commit.** `feat(core): bank CSV parsing and duplicate detection`

### Task 2: PocketSmith mapping and staleness (core)

**Files:**
- Create: `packages/core/src/sync/pocketsmith.ts`, `packages/core/src/sync/staleness.ts`
- Test: `packages/core/test/sync/*.test.ts`

**Interfaces (Produces):**
```ts
type AccountKind = 'transaction' | 'savings' | 'credit_card' | 'mortgage' | 'brokerage' | 'manual_asset';
type ProjectionsRole = 'off' | 'etf' | 'mortgage';
type Counts = { countsSpending: boolean; countsNetWorth: boolean; projections: ProjectionsRole };
type PsTransactionAccount = { id: number; name: string; number: string | null; type: string; currency_code: string;
  current_balance: number; current_balance_date: string; institution: { id: number; title: string } };
type PsTransaction = { id: number; payee: string; original_payee: string | null; date: string; amount: number;
  status: 'posted' | 'pending'; updated_at: string; transaction_account: { id: number } };
type AccountRow = { source: 'pocketsmith'; externalId: string; institution: string; name: string; kind: AccountKind;
  balanceCents: Cents; balanceDate: string };
type TransactionRow = { source: 'pocketsmith'; externalId: string; accountExternalId: string; date: string;
  amountCents: Cents; descriptionRaw: string; payee: string; status: 'posted' | 'pending' };
mapAccount(a: PsTransactionAccount): AccountRow
mapTransaction(t: PsTransaction): TransactionRow
kindFromPocketSmithType(type: string, name: string): AccountKind
defaultCounts(kind: AccountKind): Counts
STALE_AFTER_MS = 36 * 60 * 60 * 1000
isStale(lastSuccessAt: Date | null, now: Date): boolean   // null → true
```

- [ ] **Step 1: Write the failing tests.**
  - **Account kinds:**
    - `bank` with a name containing "saver" or "savings" (any case) → `savings`;
    - any other `bank` → `transaction`;
    - `credits` → `credit_card`;
    - `loans` or `mortgage` → `mortgage`;
    - `stocks` → `brokerage`;
    - `property`, `vehicle` or `other_asset` → `manual_asset`.
  - `mapTransaction` with `amount: -12.3` gives `-1230`, and with `amount: 0.1 + 0.2` gives `30`, so it is float-safe through `Math.round(amount * 100)`.
  - `descriptionRaw` is `original_payee ?? payee`.
  - `externalId` is `String(id)`.
  - `defaultCounts` returns the table in Global Constraints for each kind.
  - **Staleness:**
    - `isStale(null, now)` → true;
    - exactly 36h → false;
    - 36h + 1ms → true.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(core): PocketSmith mapping and staleness`

### Task 3: API skeleton, Db interface and token auth

**Files:**
- Create: `apps/api/{package.json,tsconfig.json,wrangler.toml,vitest.config.ts}`, `src/{index.ts,app.ts,auth.ts}`, `src/db/db.ts`, `test/helpers.ts`, `test/auth.test.ts`

**Interfaces (Produces):**
```ts
interface Db { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>; }
neonDb(url: string): Db                                   // @neondatabase/serverless `neon(url)` .query(text, params)
hashToken(token: string): Promise<string>                 // SHA-256 hex via crypto.subtle
interface PocketSmithClient { me(): Promise<{ id: number }>; transactionAccounts(userId: number): Promise<PsTransactionAccount[]>; transactions(accountId: number, opts: { updatedSince?: string }): Promise<PsTransaction[]> }   // declared here; real impl in Task 5
type Deps = { db: Db; pocketsmith: PocketSmithClient; now: () => Date };
createApp(deps: Deps): Hono                               // all routes; bearerAuth on everything but GET /health
// test/helpers.ts
pgliteDb(): Promise<Db>                                   // fresh in-memory PGlite with migrations applied
seedToken(db: Db, token?: string): Promise<string>        // inserts hash, returns the plaintext token
fakePocketSmith(data?: { accounts?: PsTransactionAccount[]; transactions?: Record<number, PsTransaction[]>; failOnAccount?: number }): PocketSmithClient & { calls: string[] }
```
`wrangler.toml`: `name = "curly-journey-api"`, `main = "src/index.ts"`, `compatibility_flags = ["nodejs_compat"]`, `[triggers] crons = ["0 */4 * * *"]`. **No secrets in this file.**

- [ ] **Step 1: Scaffold.** Add `apps/api` to the workspace. Dependencies: `hono`, `@neondatabase/serverless`, `@curly/core`. Dev dependencies: `wrangler`, `vitest`, `@electric-sql/pglite`, `@cloudflare/workers-types`. Write `migrations/0001_init.sql` containing only the `api_token` table (`token_hash text primary key, created_at timestamptz not null default now()`). Task 4 adds the rest.
- [ ] **Step 2: Write the failing tests.**
  ```ts
  const db = await pgliteDb(); const token = await seedToken(db);
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => new Date('2026-10-23T00:00:00Z') });
  expect((await app.request('/health')).status).toBe(200);
  expect((await app.request('/accounts')).status).toBe(401);
  expect((await app.request('/accounts', { headers: { Authorization: 'Bearer cj_wrong' } })).status).toBe(401);
  expect((await app.request('/accounts', { headers: { Authorization: `Bearer ${token}` } })).status).not.toBe(401);
  expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  ```
  `GET /accounts` may return a stub `[]` for now.
- [ ] **Step 3: Run the tests.** `npm test -w @curly/api`. Expected: FAIL.
- [ ] **Step 4: Implement `auth.ts`, `app.ts` and `db.ts`.** `index.ts` exports `{ fetch, scheduled }`, where `scheduled` calls `runSync` (stub until Task 5) and builds `Deps` from `env`.
- [ ] **Step 5: Run the tests.** Expected: PASS.
- [ ] **Step 6: Commit.** `feat(api): worker skeleton with token auth`

### Task 4: Schema, migrations and repository

**Files:**
- Modify: `apps/api/migrations/0001_init.sql`
- Create: `scripts/migrate.mjs`, `scripts/create-token.mjs`, `src/db/repo.ts`
- Test: `test/repo.test.ts`

**Schema (0001_init.sql):**
```sql
create table account (
  id serial primary key,
  source text not null check (source in ('pocketsmith','manual')),
  external_id text,
  institution text not null,
  name text not null,
  display_name text,
  kind text not null,
  balance_cents bigint not null default 0,
  balance_date date,
  counts_spending boolean not null,
  counts_net_worth boolean not null,
  projections text not null default 'off' check (projections in ('off','etf','mortgage')),
  is_offset boolean not null default false,
  unique (source, external_id)
);
create table transaction (
  id bigserial primary key,
  account_id int not null references account(id),
  source text not null check (source in ('pocketsmith','csv')),
  external_id text not null,                 -- PocketSmith id, or the CSV row fingerprint
  date date not null,
  amount_cents bigint not null,
  description_raw text not null,
  payee text,
  status text not null default 'posted',
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
create index transaction_account_date on transaction (account_id, date desc);
create table sync_log (
  id serial primary key,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('running','ok','failed')),
  error text,
  accounts_synced int,
  transactions_upserted int
);
```

**Interfaces (Produces), all on `Repo` built from a `Db`:**
```ts
makeRepo(db: Db): Repo
upsertAccount(row: AccountRow): Promise<number>                 // insert uses defaultCounts(kind); update NEVER overwrites the user's switches, is_offset or display_name
upsertTransactions(accountId: number, rows: TransactionRow[]): Promise<number>   // on conflict (source, external_id) update amount/date/status/payee; returns rows affected
insertCsvRows(accountId: number, rows: { row: ImportedRow; fingerprint: string }[]): Promise<number>  // on conflict do nothing
listAccounts(): Promise<AccountDto[]>
updateAccountSettings(id: number, patch: Partial<Pick<AccountDto,'countsSpending'|'countsNetWorth'|'projections'|'isOffset'|'displayName'>>): Promise<AccountDto | null>
listTransactions(accountId: number, month: string): Promise<TransactionDto[]>    // uses monthBounds(month) on `date`; newest first
transactionsNear(accountId: number, from: string, to: string): Promise<ImportedRow[]>
startSync(now: Date): Promise<number | null>      // null if a 'running' row started < 10 min ago
finishSync(id: number, result: { status: 'ok' | 'failed'; error?: string; accounts?: number; transactions?: number }, now: Date): Promise<void>
lastSuccessfulSync(): Promise<{ startedAt: Date; finishedAt: Date } | null>
type AccountDto = { id: number; institution: string; name: string; displayName: string | null; kind: AccountKind;
  balanceCents: Cents; balanceDate: string | null; countsSpending: boolean; countsNetWorth: boolean;
  projections: ProjectionsRole; isOffset: boolean };
type TransactionDto = { id: number; date: string; amountCents: Cents; description: string; status: 'posted' | 'pending'; source: 'pocketsmith' | 'csv' };
```
`date` columns hold Sydney local dates, so `listTransactions` compares `date >= :startLocal and date < :endLocal`, using the local calendar dates of `monthBounds`. **Do not compare `date` against UTC instants.**

- [ ] **Step 1: Write the failing tests** (PGlite):
  - `upsertAccount` twice with a changed balance → one row, new balance.
  - After `updateAccountSettings(id, { countsSpending: false, isOffset: true })`, a second `upsertAccount` keeps `countsSpending: false` and `isOffset: true`.
  - A new `mortgage` account gets `countsSpending: false` and `projections: 'mortgage'`.
  - `upsertTransactions` with the same `externalId` twice → one row with the latest amount.
  - `listTransactions(id, '2026-10')` includes a row dated `2026-10-01` and excludes `2026-09-30`.
  - `insertCsvRows` with the same fingerprints twice → the second call returns 0.
  - The second `startSync` within 10 min → `null`; after `finishSync(ok)`, `startSync` → an id.
  - `lastSuccessfulSync()` ignores `failed` rows.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `migrate.mjs` reads `DATABASE_URL` from the environment and applies each `migrations/*.sql` once, tracked in a `_migration(name text primary key)` table.
  - `create-token.mjs` generates a token, inserts its hash and prints the token **once**, with "store this now, it can't be shown again".
  - `pgliteDb()` applies the same migrations.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(api): schema, migrations, repository`

### Task 5: PocketSmith client and sync

**Files:**
- Create: `src/pocketsmith/client.ts`, `src/sync/runSync.ts`, `src/routes/sync.ts`; modify `src/index.ts`
- Test: `test/sync.test.ts`, `test/pocketsmith-client.test.ts`

**Interfaces (Produces):**
```ts
// PocketSmithClient interface from Task 3; transactions() follows every Link rel="next"
pocketSmithClient(key: string, fetchImpl?: typeof fetch): PocketSmithClient   // base https://api.pocketsmith.com/v2, header X-Developer-Key, per_page=100
runSync(deps: Deps): Promise<{ status: 'ok' | 'failed' | 'skipped'; accounts: number; transactions: number; error?: string }>
// POST /sync → 200 { status, accounts, transactions } | 409 { error: 'sync_in_progress' } | 502 { error: 'sync_failed' }
// GET /sync/status → { lastSuccessAt: string | null, lastStatus: 'ok' | 'failed' | 'running' | null, stale: boolean }
```
`runSync` does the following, in order:
1. `startSync`. If it returns null, return `skipped`.
2. Call `me()`.
3. Call `transactionAccounts`, then `upsertAccount` for each.
4. For each account, call `transactions(id, { updatedSince })`, where `updatedSince` is `lastSuccessfulSync().startedAt` minus 1h (omit it on the very first sync). Then `upsertTransactions`.
5. Call `finishSync(ok)`.
6. On any thrown error, call `finishSync(failed, error.message)` and rethrow nothing.

- [ ] **Step 1: Write the failing tests.**
  - **Client:** a fake `fetchImpl` serves 2 pages linked by `Link: <…page=2>; rel="next"`. `transactions()` returns both pages' rows, and the request sent the `X-Developer-Key` header.
  - **Full sync:** using `fakePocketSmith` with 2 accounts and 3 transactions, `runSync` gives `ok`, `accounts: 2`, `transactions: 3`, and `GET /accounts` returns 2 accounts.
  - **Incremental:** the second sync passes `updatedSince` equal to the first sync's start minus 1h.
  - **Failure (Review Focus #2):**
    - the fake throws on the second account;
    - the sync log shows `failed` with the message;
    - the first account's balance is still updated;
    - `lastSuccessfulSync()` is unchanged, so the next run re-fetches.
  - **Overlap (Review Focus #3):** with a `running` row from 1 minute ago, `POST /sync` gives 409 and the fake was never called.
  - **Status:** `GET /sync/status` reports `stale: true` when there has never been a successful sync.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** `index.ts` `scheduled` builds real `Deps` from `env.DATABASE_URL` and `env.POCKETSMITH_KEY`, and calls `ctx.waitUntil(runSync(deps))`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(api): PocketSmith client and sync job`

### Task 6: Account and import routes

**Files:**
- Create: `src/routes/accounts.ts`, `src/routes/imports.ts`
- Test: `test/accounts.test.ts`, `test/imports.test.ts`

**Interfaces (Produces):**
```
GET   /accounts                              → { accounts: (AccountDto & { stale: boolean })[], lastSuccessAt: string | null }
PATCH /accounts/:id  body Partial<settings>  → AccountDto | 404; 400 on unknown keys or a bad `projections` value
GET   /accounts/:id/transactions?month=YYYY-MM → { transactions: TransactionDto[] } | 400 on a bad month
POST  /imports/preview { accountId, format: 'commbank' | 'amex', csv } → { new: ImportedRow[], duplicates: ImportedRow[], skipped: { line: number, reason: string }[] }
POST  /imports/commit  { accountId, format, csv }                     → { inserted: number }
```
- **Preview:**
  - Parse the CSV.
  - Skip unparseable lines into `skipped`; don't fail the whole file.
  - A row is a duplicate if its fingerprint already exists, **or** if `isLikelyDuplicate` matches any existing transaction from `transactionsNear(date ± 2 days)` in that account.
- **Commit:** recomputes preview server-side and inserts only `new` rows. It never trusts the client's list.
- **Limits:** CSV bodies over 2 MB → 413.

- [ ] **Step 1: Write the failing tests.**
  - **PATCH:**
    - `PATCH { isOffset: true }` persists;
    - `PATCH { projections: 'nope' }` gives 400;
    - `PATCH` on an unknown id gives 404.
  - **Transactions by month:** `month=2026-13` gives 400.
  - **Import:**
    - Previewing `commbank.csv` against an account holding a feed transaction `-8420 WOOLWORTHS 1234 SYDNEY` dated 21/10 puts the Woolworths row in `duplicates` and the rest in `new`.
    - Commit gives `inserted: 3`.
    - Committing the same file again gives `inserted: 0`.
    - A malformed line goes into `skipped` with its line number.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(api): accounts, transactions and CSV import routes`

### Task 7: Mobile connection, API client and Connect screen

**Files:**
- Create: `src/api/{connection,client,hooks}.ts`, `src/api/QueryProvider.tsx`, `app/connect.tsx`; modify `app/_layout.tsx`
- Test: `__tests__/api-client.test.ts`, `__tests__/connect.test.tsx`

**Interfaces (Produces):**
```ts
type Connection = { url: string; token: string };
loadConnection(): Promise<Connection | null>; saveConnection(c: Connection): Promise<void>; clearConnection(): Promise<void>   // expo-secure-store keys 'api.url', 'api.token'
class ApiError extends Error { status: number }  class UnauthorizedError extends ApiError {}
apiFetch<T>(conn: Connection, path: string, init?: RequestInit): Promise<T>     // adds Bearer header, JSON; 401 → UnauthorizedError
useConnection(): { conn: Connection | null; loading: boolean; set(c): Promise<void>; clear(): Promise<void> }
useAccounts(), useTransactions(accountId, month), useSyncNow(), useUpdateAccount(), useImportPreview(), useImportCommit()
```
- **Root layout:** inside `LockGate`, wrap the app in `QueryProvider`. If there is no connection, redirect to `/connect`.
- **Bad token:** any `UnauthorizedError` from a query clears the connection and redirects to `/connect`, showing the plain-text message "That token didn't work. Paste a new one." (Review Focus #5).
- **Connect screen:**
  - fields for the API URL (must start with `https://`) and the token (must start with `cj_`);
  - a **Connect** button that calls `GET /health`, then `GET /accounts` with the token, and saves the connection only if both succeed.

- [ ] **Step 1: Write the failing tests.**
  - `apiFetch` sends `Authorization: Bearer cj_x`.
  - A 401 response throws `UnauthorizedError`.
  - The Connect screen rejects an `http://` URL with a plain error.
  - A successful connect calls `saveConnection` with trimmed values. Use mocked `fetch` and the `expo-secure-store` mock.
  - `useAccounts` receiving a 401 calls `clearConnection`.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Install with `npx expo install @tanstack/react-query expo-secure-store`.
- [ ] **Step 4: Run the tests.** Run `npx jest --ci -i`. Expected: PASS, with Plan 1's tests still green (they render with a stubbed connection).
- [ ] **Step 5: Commit.** `feat(mobile): API connection, client and Connect screen`

### Task 8: Accounts tab

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Create: `src/components/{AccountRow,SyncBanner}.tsx`
- Test: `__tests__/accounts-tab.test.tsx`

**Behaviour:**
- **Grouping:** accounts are grouped by `institution`, in the order CommBank, Amex, Up, CommSec, then any others alphabetically.
- **Each row shows:** an `IconTile` (emoji by kind: transaction 🏠, savings 🐷, credit_card 💳, mortgage 🏦, brokerage 📈, manual_asset 🏡), `displayName ?? name`, `<Amount decimals="never">`, an "Offset · home loan" muted subline when `isOffset`, and a yellow `Pill tone="warn"` reading "synced N days ago" when `stale`.
- **Banner:** a `SyncBanner` above the list appears when any `countsSpending` account is stale. The plain text is "<Institution> hasn't updated since <Weekday>" with a "Check" link to More › Settings. If the last sync failed, the text is "Sync failed · Check".
- **Pull to refresh:** calls `useSyncNow()`, then refetches. A 409 is treated as success.
- **Empty state:** "No accounts yet. Connect PocketSmith in the backend, then pull to refresh."
- **Home hero card:** not in this plan (Plan 3). Show the Accounts title only.

- [ ] **Step 1: Write the failing tests** (mocked hooks):
  - Grouping order is correct.
  - The stale pill appears only on stale accounts.
  - The banner appears when a spending account is stale and doesn't when only the mortgage is stale.
  - With Hide balances on, every balance reads `$•••`.
  - Pull-to-refresh calls sync.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): real Accounts tab with sync status`

### Task 9: Account detail and account settings

**Files:**
- Create: `app/account/[id].tsx`, `app/account/[id]/settings.tsx`, `src/components/TransactionRow.tsx`
- Test: `__tests__/account-detail.test.tsx`, `__tests__/account-settings.test.tsx`

**Behaviour (visual spec screen 1, minus Plan 3 parts):**
- **Header:**
  - icon and name, a ⚙ button that opens settings;
  - the balance as `<Amount>`, plus "synced <time>";
  - an "Offset · home loan" badge when `isOffset`;
  - a `MonthSwitcher` that defaults to `monthKey(new Date())`.
- **List:** transactions grouped by day, using headers like "Today · Thu 22 Oct" and "Tue 20 Oct", formatted in Sydney time.
- **Transaction rows:** description, then a muted subline "Pending" if pending. The amount is shown with `signed` for money in, in lime.
- **No Categories page or spent total yet** (Plan 3). Ledger this as a Ruling.
- **Settings screen:**
  - `Toggle`s for Spending, Net worth and Offset for home loan;
  - a `Segmented` control for Projections (Off / ETFs / Mortgage);
  - a display-name field;
  - every change calls `PATCH` immediately, with an optimistic update;
  - the HandNote "super stays out of your spending, promise" appears only for `manual_asset` accounts.

- [ ] **Step 1: Write the failing tests.**
  - **Day grouping:** rows dated 2026-10-22 and 2026-10-20 with "today" = 2026-10-22 Sydney produce the headers "Today · Thu 22 Oct" and "Tue 20 Oct".
  - **Month switching:** changing month requests `month=2026-09`.
  - **Pending:** a pending row shows "Pending".
  - **Settings:** toggling Offset sends `PATCH { isOffset: true }`, and choosing Mortgage in the Segmented control sends `{ projections: 'mortgage' }`.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): account detail and per-account settings`

### Task 10: CSV import screen

**Files:**
- Create: `app/import.tsx`; modify `app/(tabs)/more.tsx` (add an "Import" row)
- Test: `__tests__/import.test.tsx`

**Behaviour:** a 3-step flow with a step bar, matching the visual spec screen 7 import pattern.
1. **Pick:**
   - choose the account (non-manual accounts only);
   - choose the format (CommBank / Amex; it defaults to Amex if the institution is Amex, otherwise CommBank);
   - pick a `.csv` with `expo-document-picker`;
   - read it as text with `expo-file-system` (`File(uri).text()`).
2. **Check:**
   - call `useImportPreview`;
   - show count tiles for New / Already have / Skipped;
   - list the first 20 rows, tagged `NEW` or `HAVE IT`;
   - show the HandNote "no doubles, we checked".
3. **Done:**
   - "Import N transactions" calls commit, then shows "Imported N" and refetches the account's transactions.

Rules:
- Files over 2 MB are rejected on the phone with a plain message before upload.

- [ ] **Step 1: Write the failing tests** (mock picker, file and hooks):
  - Preview counts render.
  - The import button reads "Import 3 transactions".
  - Commit is called with the same `accountId`, `format` and `csv`.
  - A 3 MB file shows "That file is too big (max 2 MB)" and never calls preview.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Install with `npx expo install expo-document-picker expo-file-system`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(mobile): CSV import flow`

### Task 11: Deploy and first sync (needs the owner)

**Files:** add a "Backend setup" section to `README.md`.

- [ ] **Step 1: Write the README steps.** In this order:
  1. Create a Neon project in the Sydney region and copy its pooled connection string.
  2. Run `cd apps/api && npx wrangler login`.
  3. Run `npx wrangler secret put DATABASE_URL` and paste the connection string **into the prompt, not into chat**.
  4. Run `npx wrangler secret put POCKETSMITH_KEY` the same way.
  5. Run `DATABASE_URL=... node scripts/migrate.mjs`. Use the `$env:DATABASE_URL="..."` form in PowerShell.
  6. Run `node scripts/create-token.mjs` and save the printed token in your password manager.
  7. Run `npx wrangler deploy` and note the `https://curly-journey-api.<you>.workers.dev` URL.
  8. In the app, open the Connect screen and enter the URL and the token.
  9. Pull to refresh on Accounts.
- [ ] **Step 2: The owner runs the steps.** Then check each of these:
  - the accounts appear;
  - the balances match the bank apps;
  - transactions appear by month;
  - an Amex CSV import with overlapping dates shows duplicates and adds only the new rows.

  Record the results in the ledger.
- [ ] **Step 3: Build a new APK.** Run `npx eas-cli build -p android --profile preview`, because new native modules were added (`expo-secure-store`, `expo-document-picker`).
- [ ] **Step 4: Commit.** `docs: backend setup steps`

---

## Not in this plan
Plan 3 covers:
- categories and the categorisation pipeline;
- merchant cleanup;
- transfer, mortgage and refund detection;
- spending totals;
- the Categories page;
- the Amex statement toggle;
- the Spending tab;
- the Home hero card and in/out chart.
