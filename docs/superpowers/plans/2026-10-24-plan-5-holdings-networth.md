# Plan 5: Holdings and Net Worth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can:
- import their CommSec transaction history (or add trades by hand) and see their ETF holdings valued at the latest close, with average cost and gain;
- get a push hint when a CommSec payment shows up in CommBank with no trade recorded;
- see their net worth: a total, a history chart from daily snapshots, and own/owe lists, from a lime row on Home.

**Architecture:**
- **Pure logic in `packages/core`**, unit-tested with plain data:
  - the CommSec CSV parser and trade fingerprints;
  - holdings from trades (average-cost method), value and gain;
  - net worth lines, totals, offset grouping, home growth;
  - snapshot range filtering and the "since" note;
  - the trade-hint rule, added to the notification planner.
- **CommSec is one `account` row** with `source = 'commsec'`, `kind = 'brokerage'`, created on the first trade. Its `balance_cents` is the holdings value at the latest close, rewritten whenever trades or prices change, so every existing balance consumer (Home list, net worth) just works.
- **A third Worker cron runs a daily job** (`17 7 * * *` UTC, 18:17 AEDT / 17:17 AEST, after the ASX close). It fetches closing prices for held symbols, refreshes the CommSec balance, and writes today's net-worth snapshot. Its own 50-request budget.
- **The trade hint rides in the hourly alerts job** (one extra query).
- **Mobile adds:** CommSec screen (screen 7) with a 3-step import and an Add-trade sheet; Net worth screen (screen 5) with an area chart; a lime net worth row on Home; More rows; a growth % field for manual accounts; a "CommSec hint" notification switch.

**Tech Stack:** Everything from Plans 1–4. No new native modules (`expo-document-picker` and `react-native-svg` are already in). Prices come from Yahoo Finance's public chart endpoint (`https://query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>.AX?range=1mo&interval=1d`), no key. No APK-only change is needed beyond the usual rebuild.

**Spec:** `docs/superpowers/specs/2026-10-22-curly-journey-v1-design.md` (§5 "read-only"; §6 rows "ETF holdings", "Mortgage structure", "Super and home"; §8 rows CommSec, ETF prices, Home; §9.8; §9.9; §9.11 "CommSec trade hint"; §11 step 5; §12 "choice of price API", "CSV parsing") and `docs/superpowers/specs/2026-10-22-curly-journey-v1-visual-design.md` (§3 hand-drawn layer; §5 components; §6 charts — axes required; §7 screens H, 5, 7). Mockups: `docs/design/mockups/05-net-worth.html`, `docs/design/mockups/07-commsec.html`, `docs/design/mockups/00-style-home-spending-projections.html` (Home net worth row). Executors read both specs.

## Global Constraints

- **Everything from Plans 1–4 still applies:**
  - integer cents; `Australia/Sydney` dates;
  - `<Amount>` for every dollar figure, so hide balances holds;
  - auth on every route except `/health`;
  - secrets only in Worker secrets;
  - never overwrite the owner;
  - the 50-request Workers Free limit: bulk SQL, bounded queries, a call counter per job;
  - mobile Jest only as `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i --forceExit <pattern>`;
  - no dollar amounts in notification text.
- **Read-only.** The app records trades the owner made; it never places them.
- **Prices are integer micro-dollars** (`priceMicros = dollars × 1,000,000`), because CommSec prints up to 6 decimals. Convert to cents only at the edges: `grossCents = round(units × priceMicros / 10,000)`, half away from zero, done in integer maths (`BigInt` where a product can pass 2^53).
- **Units are whole numbers.** CommSec trades ASX ETFs in whole units. A non-integer unit count is a skipped row.
- **Symbols** are upper case, 2–6 letters or digits, without the `.AX` suffix. The `.AX` suffix is added only inside the price client.
- **Average-cost method.** Buys add `units` and `totalCents` (gross + brokerage) to cost. A sell removes `units × (cost ÷ units)` from cost, rounded to the cent. Selling more units than held is a parse-level warning, not a crash: units floor at 0 and cost resets to 0.
- **Net-worth sign rule:** a line's value is the account's balance (or holdings value). Value < 0 goes in **Owe**; value ≥ 0 goes in **Own**. `total = Σ own + Σ owe` (owe values are negative). Only accounts with `counts_net_worth = true` count.
- **Offsets** (`is_offset = true`) group into one Own line "Offsets (n)" whose value is their sum; it expands to the members.
- **Home growth:** a manual account with `growth_bps` set is shown at `round(value × (1 + bps/10,000)^(days/365.25))` where `days` is from its as-of date to today. Growth applies to the displayed value and the snapshot, never to the stored value.
- **New SQL lives in new modules** under `apps/api/src/db/` (`holdings.ts`, `networth.ts`), same conventions as `repo.ts`: dates cast to text, bigints to numbers, each exports `make…Repo(db)`.
- **Key formats** (notification_log): trade hint `trade:<transactionId>`.
- **Hint copy (exact):** title `CommSec`, body `Looks like you bought something on CommSec. Import or add the trade?`

## Review Focus

1. **A re-imported CommSec CSV with overlapping dates.** The owner exports "last 12 months" twice. Expected: the second import shows every overlapping trade as HAVE IT and inserts none of them; nothing doubles. Test in Task 1 (fingerprint stability) and Task 3 (import twice).
2. **The real CommSec file differs from the documented format** (extra columns, a title row above the header, `Details` wording). Expected: rows that aren't trades are ignored quietly; rows that look like trades but don't parse are listed as skipped with a reason; the import never fails as a whole. Test in Task 1 (title row, extra column, unknown details), and the owner's shape check in Task 9.
3. **Price fetch fails or returns nothing** (Yahoo down, weekend, a symbol it doesn't know). Expected: the last stored close is kept, the holdings screen shows "price as of <date>", the snapshot still gets written. Test in Task 4.
4. **A sell larger than the units held** (an import that starts mid-history, after an earlier buy that isn't in the file). Expected: holdings floor at 0, no negative units, no crash, and the CommSec screen still renders. Test in Task 1.
5. **Hide balances on the new screens.** Expected: every dollar figure on CommSec, Net worth, the Home row, and the chart's y-axis labels is masked; unit counts stay visible only where coin units already are (they are masked, matching Plan 4's ruling). Test in Tasks 7 and 8.

---

### Task 1: Core — CommSec parser and holdings maths

**Files:**
- Create: `packages/core/src/holdings/commsec.ts`, `packages/core/src/holdings/holdings.ts`
- Modify: `packages/core/src/index.ts` (export both)
- Test: `packages/core/test/commsec.test.ts`, `packages/core/test/holdings.test.ts`

**Interfaces:**
- Produces:
  - `type TradeSide = 'buy' | 'sell'`
  - `type ParsedTrade = { date: string; reference: string | null; side: TradeSide; symbol: string; units: number; priceMicros: number; brokerageCents: number; totalCents: number }`
  - `parseCommSecRows(text: string): { trades: ParsedTrade[]; skipped: SkippedRow[]; ignored: number }`
  - `tradeFingerprint(t: Pick<ParsedTrade, 'date' | 'reference' | 'side' | 'symbol' | 'units' | 'priceMicros'>): string`
  - `grossCents(units: number, priceMicros: number): number`
  - `parsePriceToMicros(s: string): number` (throws `RangeError`)
  - `type EtfHolding = { symbol: string; units: number; costCents: number }`
  - `holdingsFromTrades(trades: Pick<ParsedTrade, 'date' | 'side' | 'symbol' | 'units' | 'totalCents'>[]): EtfHolding[]` — sorted by symbol, zero-unit holdings dropped; trades applied in date order, buys before sells on the same date
  - `type ValuedEtfHolding = EtfHolding & { closeMicros: number | null; priceDate: string | null; valueCents: number; avgCostMicros: number; gainCents: number; gainBps: number }`
  - `valueHoldings(h: EtfHolding[], closes: Map<string, { closeMicros: number; date: string }>): ValuedEtfHolding[]` — no close means `valueCents = costCents`, `gainCents = 0`
  - `avgMonthlyInvestmentCents(trades, today: string): number` — Σ buy totals − Σ sell totals with `date > minusMonths(today, 12)`, ÷ 12, rounded (used by Plan 6)
- Consumes: `parseCsvRecords`, `parseAuDate`, `parseDecimalToCents`, `SkippedRow` from `packages/core/src/import/*`; `minusMonths` from `dates.ts`.

**The CommSec format** (Transactions export, from CommSec → Portfolio → Transactions → Download CSV):
```
Date,Reference,Details,Debit($),Credit($),Balance($)
24/10/2026,C1234567,B 15 VAS @ 102.450000,1546.75,,0.00
```
- `Details` for trades: `^(B|S)\s+([\d,]+)\s+([A-Z0-9]{2,6})(?:\.AX)?\s+@\s+([\d.]+)$` (case-insensitive, trimmed).
- A buy's total is `Debit`; a sell's total is `Credit`. `brokerageCents = total − gross` for a buy, `gross − total` for a sell; a negative brokerage is a skipped row ("Amount doesn't match units × price").
- Locate columns **by header name**, not position (`date`, `reference`, `details`, `debit`, `credit`; compare lower-cased with `($)` and spaces removed). Rows before the header row are ignored. No header found → every row skipped with reason `No CommSec header row`.
- Rows whose `Details` doesn't start with `B ` or `S ` followed by a digit count as `ignored` (deposits, withdrawals, dividends). Rows that match the start but fail later are `skipped` with a reason.
- `tradeFingerprint`: `ref:<reference>` when there is a reference, otherwise `<date>|<side>|<symbol>|<units>|<priceMicros>`.

- [ ] **Step 1: Write the failing tests** in `commsec.test.ts`:
  - parses the two-line sample above into `{ date: '2026-10-24', reference: 'C1234567', side: 'buy', symbol: 'VAS', units: 15, priceMicros: 102450000, brokerageCents: 1000, totalCents: 154675 }` (gross 15 × 102.45 = 1536.75, plus 10.00 brokerage).
  - a sell `S 10 VGS @ 140.100000` with Credit `1391.00` → `side: 'sell'`, `totalCents: 139100`, `brokerageCents: 1000`.
  - a title row (`"Transactions for account 1234567"`) above the header and an extra trailing column are tolerated.
  - `Direct Credit 123456 COMMONWEALTH` → `ignored: 1`, no skipped.
  - `B 1.5 VAS @ 100` → skipped, reason mentions whole units.
  - Debit smaller than gross → skipped, reason `Amount doesn't match units × price`.
  - no header → all rows skipped with `No CommSec header row`.
  - `tradeFingerprint` is the same for the same row parsed twice; differs when reference differs.
  - `grossCents(3, 333333)` = 100 (0.999999 rounds to 1.00); `grossCents(1_000_000, 999_999_999)` stays exact (BigInt path).
- [ ] **Step 2: Write the failing tests** in `holdings.test.ts`:
  - buy 10 @ total 100000, buy 10 @ total 120000 → `{ units: 20, costCents: 220000 }`;
  - then sell 5 → `{ units: 15, costCents: 165000 }`;
  - sell 30 with only 20 held → `units: 0` and the holding is dropped (no throw);
  - same-date buy and sell apply buy first;
  - `valueHoldings` with close 12_000_000 micros on 15 units → `valueCents: 18000`, `avgCostMicros` = cost ÷ units in micros, `gainCents` and `gainBps` correct to the basis point; with no close → value = cost, gain 0, `closeMicros: null`;
  - `avgMonthlyInvestmentCents`: buys 120000 and a sell 24000 inside 12 months, one buy 13 months ago → `8000`.
- [ ] **Step 3: Run** `cd packages/core && npx vitest run test/commsec.test.ts test/holdings.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 4: Implement** both modules and export them from `index.ts`.
- [ ] **Step 5: Run** `cd packages/core && npx vitest run && npx tsc --noEmit`. Expected: all pass, tsc clean.
- [ ] **Step 6: Commit** `feat(core): CommSec parser and average-cost holdings`.

### Task 2: Core — net worth and the trade-hint rule

**Files:**
- Create: `packages/core/src/networth/networth.ts`
- Modify: `packages/core/src/notify/plan.ts`, `packages/core/src/index.ts`, `apps/api/src/alerts/runAlerts.ts` (compile stub only)
- Test: `packages/core/test/networth.test.ts`, `packages/core/test/notify.test.ts` (extend)

**Interfaces:**
- Produces:
  - `type NwAccount = { id: number; name: string; kind: AccountKind; balanceCents: number; balanceDate: string | null; source: string; isOffset: boolean; countsNetWorth: boolean; growthBps: number | null }`
  - `type NwLine = { key: string; name: string; valueCents: number; accountIds: number[]; stale: boolean; members?: NwLine[] }` — `key` is `acct:<id>` or `offsets`
  - `netWorth(accounts: NwAccount[], today: string): { totalCents: number; ownCents: number; oweCents: number; own: NwLine[]; owe: NwLine[] }` — lists sorted by `|value|` descending; `stale` = `source === 'manual' && isManualStale(balanceDate, today)`
  - `grownValue(valueCents: number, asOf: string, growthBps: number, today: string): number`
  - `type NwRange = '1M' | '6M' | '1Y' | 'All'`
  - `rangeStart(range: NwRange, today: string): string | null` (`null` for All; otherwise `shiftMonths` back 1/6/12)
  - `sinceNote(points: { date: string; totalCents: number }[]): { fromDate: string; deltaCents: number } | null` — first vs last point; `null` with fewer than 2 points
  - In `plan.ts`: `NotificationType` gains `'trade_hint'`; `PlanInput` gains `tradeHints: { transactionId: number; date: string }[]`. Each hint with `enabled.trade_hint` and after 09:00 → `{ keys: ['trade:<id>'], type: 'trade_hint', title: 'CommSec', body: 'Looks like you bought something on CommSec. Import or add the trade?', url: '/commsec?hint=<id>' }`.
  - `const TRADE_HINT_DAYS = 5` exported (the ±5-day window, spec §9.9).
- Consumes: `isManualStale` (limits.ts), `shiftMonths`, `daysBetween` (dates.ts), `AccountKind`.

- [ ] **Step 1: Write failing tests**: sign rule (Amex −2000 → owe, offset 5000 ×2 grouped as `Offsets (2)` with value 10000 and two members); accounts with `countsNetWorth: false` excluded; total = own + owe; manual home with `growthBps: 500` one year after as-of → value × 1.05 ±1 cent; stale flag on a manual account dated 4 months ago and not on a PocketSmith account; `rangeStart('6M', '2026-10-24')` = `'2026-04-24'`; `sinceNote` delta; planner emits the hint with the exact copy and key, and nothing when `trade_hint` is off or before 09:00.
- [ ] **Step 2: Run** `cd packages/core && npx vitest run test/networth.test.ts test/notify.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Update every existing `planNotifications` call in core tests with `tradeHints: []`. Keep `apps/api` compiling in this task: in `runAlerts.ts` pass `tradeHints: []` (Task 5 fills it) and `enabled: { ...enabled, trade_hint: false }` until Task 3's migration adds the pref; Task 3 removes that override.
- [ ] **Step 4: Run** `cd packages/core && npx vitest run && npx tsc --noEmit`, then `cd apps/api && npx tsc --noEmit && npx vitest run test/alerts.test.ts`. Expected: pass.
- [ ] **Step 5: Commit** `feat(core): net worth lines, growth, ranges and CommSec hint rule`.

### Task 3: Migration 0006, holdings repo and routes

**Files:**
- Create: `apps/api/migrations/0006_holdings.sql`, `apps/api/src/db/holdings.ts`, `apps/api/src/routes/holdings.ts`
- Modify: `apps/api/src/app.ts` (route), `apps/api/src/alerts/runAlerts.ts` (drop Task 2's `trade_hint: false` override), `apps/api/src/routes/notify.ts` (`TYPES` gains `'trade_hint'`)
- Test: `apps/api/test/holdings.test.ts`, `apps/api/test/migrations.test.ts` (extend)

**Migration `0006_holdings.sql`:**
- `account_source_check` allows `'pocketsmith','manual','coinspot','commsec'`.
- `alter table account add column if not exists growth_bps int check (growth_bps between -2000 and 2000)`.
- `trade (id serial pk, account_id int not null references account(id) on delete cascade, date date not null, side text not null check (side in ('buy','sell')), symbol text not null, units int not null check (units > 0), price_micros bigint not null check (price_micros > 0), brokerage_cents bigint not null check (brokerage_cents >= 0), total_cents bigint not null check (total_cents > 0), source text not null check (source in ('csv','manual')), fingerprint text not null unique, created_at timestamptz not null default now())`.
- `price (symbol text not null, date date not null, close_micros bigint not null, primary key (symbol, date))`.
- `net_worth_snapshot (date date primary key, own_cents bigint not null, owe_cents bigint not null)`.
- `trade_hint_dismissed (transaction_id bigint primary key references transaction(id) on delete cascade)`.
- `notification_pref` check allows `'trade_hint'`; insert `('trade_hint', true)` on conflict do nothing.

**Repo `makeHoldingsRepo(db)`:**
- `commsecAccountId(): Promise<number | null>`
- `ensureCommsecAccount(now: Date): Promise<number>` — upsert on `(source, external_id) = ('commsec','commsec')`, institution `CommSec`, name `CommSec`, kind `brokerage`, counts from `defaultCounts('brokerage')`
- `trades(accountId): Promise<TradeRow[]>` (`TradeRow = ParsedTrade & { id: number; source: 'csv' | 'manual' }`), date order
- `existingFingerprints(fps: string[]): Promise<Set<string>>` — one query, `= any($1)`
- `insertTrades(accountId, rows: (ParsedTrade & { source; fingerprint })[]): Promise<number>` — one bulk insert via `unnest`, `on conflict (fingerprint) do nothing`, returns count inserted
- `deleteTrade(id): Promise<boolean>`
- `latestCloses(symbols: string[]): Promise<Map<string, { closeMicros: number; date: string }>>` — one query (`distinct on (symbol)`)
- `upsertPrices(rows: { symbol; date; closeMicros }[]): Promise<void>` — one bulk query
- `setCommsecBalance(accountId, valueCents, date): Promise<void>`
- `dismissHint(transactionId): Promise<void>`

**Routes** (all under auth):
- `GET /holdings` → `{ accountId: number | null; valueCents; costCents; gainCents; gainBps; priceDate: string | null; holdings: ValuedEtfHolding[]; trades: TradeRow[] }` (empty and zeros when no account yet)
- `POST /holdings/import/preview` body `{ csv }` (2 MB cap and error codes as `imports.ts`) → `{ new: ParsedTrade[]; have: ParsedTrade[]; skipped: SkippedRow[]; ignored: number }`
- `POST /holdings/import` body `{ csv }` → re-parses server-side, inserts only new, refreshes the CommSec balance from latest closes, → `{ imported: number }`
- `POST /holdings/trades` body `{ date, side, symbol, units, price, brokerage }` (price/brokerage as decimal strings) → `201 { trade }`; fingerprint `manual:<uuid>` so manual trades never collide; 400 `bad_trade` on invalid input
- `DELETE /holdings/trades/:id` → 204 / 404, then refreshes the balance
- `POST /holdings/hints/:transactionId/dismiss` → 204
- After any trade change: `setCommsecBalance(Σ valueHoldings(...).valueCents, sydneyDate(now))`.

- [ ] **Step 1: Write failing tests** (pglite helpers): migration applies twice cleanly; preview of the Task 1 sample shows 1 new; import inserts it and creates the CommSec account with `counts_spending = false`, `counts_net_worth = true`, `projections = 'etf'`; **importing the same CSV again → preview `have: 1, new: 0`, import `imported: 0`**; manual trade validation (units 0, bad symbol, bad date → 400); delete updates the balance; `GET /holdings` values with a seeded price; `GET /notify/prefs` now includes `trade_hint: true`.
- [ ] **Step 2: Run** `cd apps/api && npx vitest run test/holdings.test.ts test/migrations.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cd apps/api && npx vitest run && npx tsc --noEmit`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(api): trades, prices and CommSec holdings`.

### Task 4: Daily job — prices and net-worth snapshots

**Files:**
- Create: `apps/api/src/prices/yahoo.ts`, `apps/api/src/daily/runDaily.ts`, `apps/api/src/db/networth.ts`, `apps/api/src/routes/networth.ts`
- Modify: `apps/api/src/app.ts` (`Deps` gains `prices?: PriceClient`; route), `apps/api/src/index.ts` (`DAILY_CRON = '17 7 * * *'`, dispatch), `apps/api/wrangler.toml` (crons `["*/15 * * * *", "7 * * * *", "17 7 * * *"]`), `apps/api/src/routes/accounts.ts` (PATCH accepts `growthBps` for manual accounts only, `-2000..2000` or `null`), `apps/api/src/db/repo.ts` (`AccountDto` gains `growthBps`)
- Test: `apps/api/test/daily.test.ts`, `apps/api/test/networth.test.ts`, `apps/api/test/scheduled.test.ts` (extend), `apps/api/test/accounts.test.ts` (extend)

**Interfaces:**
- `type PriceClient = { closes(symbol: string): Promise<{ date: string; closeMicros: number }[]> }`; `yahooPrices(fetchImpl = fetch): PriceClient` — GET the chart URL for `<symbol>.AX`, 10 s timeout (`AbortSignal.timeout`), header `User-Agent: curly-journey/1`; reads `chart.result[0].timestamp[]` and `indicators.quote[0].close[]`; skips null/NaN closes; date = `sydneyDate(new Date(ts × 1000))`; close → micros via `Math.round(close × 1e6)`. Any HTTP or shape error throws.
- `runDaily(deps): Promise<{ prices: number; snapshot: boolean }>` with `MAX_DAILY_CALLS = 20`:
  1. CommSec account + trades (≤ 2 queries); symbols held now.
  2. For each symbol (at most 10), `deps.prices?.closes(symbol)`; a failure for one symbol is logged by status only and the others continue.
  3. `upsertPrices` (1), then `setCommsecBalance` from `latestCloses` (2).
  4. Load net-worth accounts (1), compute `netWorth` with core, upsert today's snapshot (1).
  Prices failing never stops the snapshot.
- `makeNetWorthRepo(db)`: `accounts(): Promise<NwAccount[]>` (one query; manual accounts' `balance_cents` is already their latest value); `upsertSnapshot(date, ownCents, oweCents)`; `history(from: string | null): Promise<{ date: string; totalCents: number }[]>`.
- `GET /networth?range=1M|6M|1Y|All` (default `6M`; anything else → 400) → `{ totalCents, ownCents, oweCents, own: NwLine[], owe: NwLine[], history, since: { fromDate, deltaCents } | null }`. Live totals come from current balances (with growth); `history` from snapshots; today's live point is appended to `history` when today has no snapshot yet.

- [ ] **Step 1: Write failing tests**: `yahooPrices` with a stub fetch (good payload; null closes skipped; HTTP 500 throws; timeout signal is passed); `runDaily` with a fake price client — prices stored, CommSec balance updated, snapshot written; **prices throwing → snapshot still written and the old close kept**; call budget never exceeded with 10 symbols; `scheduled` routes `17 7 * * *` to `runDaily`; `/networth` shape, range validation, offsets grouped, today appended; PATCH `growthBps` on a manual account works and on a PocketSmith account → 400.
- [ ] **Step 2: Run** `cd apps/api && npx vitest run test/daily.test.ts test/networth.test.ts test/scheduled.test.ts test/accounts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `index.ts`, `depsFor` sets `prices: yahooPrices()`.
- [ ] **Step 4: Run** `cd apps/api && npx vitest run && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): daily prices and net-worth snapshots`.

### Task 5: Trade hint in the alerts job

**Files:**
- Modify: `apps/api/src/alerts/runAlerts.ts`, `apps/api/src/db/holdings.ts` (add `hintCandidates`)
- Test: `apps/api/test/alerts.test.ts` (extend)

**Interfaces:**
- `hintCandidates(today: string): Promise<{ transactionId: number; date: string }[]>` — one query: transactions in PocketSmith accounts with `amount_cents < 0`, `date >= today − 14 days`, `description_raw` or `payee` matching `commsec` (case-insensitive), with **no** trade whose date is within `TRADE_HINT_DAYS` of the transaction date, and not in `trade_hint_dismissed`.
- `runAlerts` passes the result as `tradeHints`; budget comment updated (16 calls).

- [ ] **Step 1: Write failing tests**: a `COMMSEC SECURITIES` debit 2 days ago with no trade → one push with the exact copy and `url: '/commsec?hint=<id>'`; a trade 4 days later → no push; a dismissed one → no push; a second run → no repeat (key logged); pref off → no push.
- [ ] **Step 2: Run** `cd apps/api && npx vitest run test/alerts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cd apps/api && npx vitest run && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): CommSec trade hint`.

### Task 6: Mobile — API hooks and types

**Files:**
- Modify: `apps/mobile/src/api/types.ts`, `apps/mobile/src/api/hooks.ts`
- Test: `apps/mobile/__tests__/holdings-hooks.test.tsx`

**Interfaces:**
- Types mirroring Task 3/4 responses: `CommsecResponse`, `ValuedEtfHolding`, `Trade`, `TradePreview`, `NetWorthResponse`, `NwLine`, `NwRange`; `Account` gains `growthBps: number | null`; `NotificationPrefs` gains `trade_hint`.
- Hooks: `useCommsec()` (query key `['commsec']`; the name `useHoldings` and key `['holdings', id]` already belong to Plan 4's CoinSpot holdings), `useCommsecPreview()` (mutation), `useCommsecImport()`, `useAddTrade()`, `useDeleteTrade()`, `useDismissHint()`, `useNetWorth(range)`. Every trade mutation invalidates `['commsec']`, `['networth']`, `['accounts']`.

- [ ] **Step 1: Write failing tests** (pattern of `update-transaction.test.tsx`, with `gcTime: Infinity` so Jest exits): import invalidates `['commsec']`, `['networth']` and `['accounts']`; `useNetWorth('1Y')` requests `/networth?range=1Y`.
- [ ] **Step 2: Run** `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i --forceExit holdings-hooks`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command and `cd apps/mobile && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat(mobile): holdings and net worth hooks`.

### Task 7: Mobile — CommSec screen, import and Add trade (screen 7)

**Files:**
- Create: `apps/mobile/app/commsec.tsx`, `apps/mobile/app/commsec-import.tsx`, `apps/mobile/src/components/TradeSheet.tsx`, `apps/mobile/src/components/AllocationBar.tsx`
- Modify: `apps/mobile/app/account/[id].tsx` (a `brokerage` account redirects to `/commsec`), `apps/mobile/app/(tabs)/more.tsx` (row `📈 CommSec`, subline = value via `<Amount>` or "Import your trades"), `apps/mobile/app/notifications.tsx` (row `trade_hint`: title `CommSec hint`, sub `When a CommSec payment has no trade`)
- Test: `apps/mobile/__tests__/commsec.test.tsx`, `apps/mobile/__tests__/notifications.test.tsx` (extend), `apps/mobile/__tests__/more.test.tsx` (extend)

**Behaviour (match `07-commsec.html`):**
- Header: underlined total value, note "up/down $X (Y%) on what you paid", "price as of <day month>" when `priceDate` is older than the last weekday.
- Allocation bar: one segment per holding, widths by value, colours from the category accent list in order.
- Holdings cards: symbol, units, average cost, value, gain ($ and %), lime when gain ≥ 0 and red otherwise.
- Buttons: **Import CSV** → `/commsec-import`; **Add trade** → `TradeSheet`.
- Trades list (most recent first) under the cards; long-press → confirm "Delete this trade?" → `useDeleteTrade`.
- `?hint=<id>`: a banner "Looks like you bought something on CommSec." with **Import CSV**, **Add trade**, **Not a trade** (dismiss, then clears the param).
- Import screen: step bar (1 Choose file · 2 Check · 3 Done); file via `expo-document-picker` as in `import.tsx`; preview counts "N new · N already have · N skipped" and a list with NEW / HAVE IT tags and skipped reasons; button "Import N trades" (disabled at 0); done step shows the count and a "Back to CommSec" button.
- `TradeSheet`: date (default today), Buy/Sell segmented, symbol (upper-cased), units (whole), price per unit, brokerage (default `0`). Save errors show inline.
- Empty state (no account): "No trades yet" with both buttons.
- All dollar figures through `<Amount>`; units masked when hide balances is on (Plan 4 ruling).

- [ ] **Step 1: Write failing tests**: renders holdings and the allocation bar from a mocked response; hide balances masks values and units; import flow walks the three steps with mocked preview/import; "Not a trade" calls dismiss; TradeSheet rejects 1.5 units; More shows the CommSec row; Notifications shows the new switch.
- [ ] **Step 2: Run** `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i --forceExit commsec notifications more`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat(mobile): CommSec holdings, import and trades`.

### Task 8: Mobile — Net worth screen, Home row, growth field (screen 5, H)

**Files:**
- Create: `apps/mobile/app/networth.tsx`, `apps/mobile/src/components/NetWorthChart.tsx`, `apps/mobile/src/components/NetWorthRow.tsx`
- Modify: `apps/mobile/app/(tabs)/index.tsx` (NetWorthRow under the hero card, above upcoming events), `apps/mobile/app/(tabs)/more.tsx` (row `💰 Net worth` first in the shortcuts group), `apps/mobile/app/account/[id]/settings.tsx` (manual accounts: "Grows by % a year" field, blank = none, `-20..20`, one decimal, saved as `growthBps`)
- Test: `apps/mobile/__tests__/networth.test.tsx`, `apps/mobile/__tests__/accounts-tab.test.tsx` (Home; extend), `apps/mobile/__tests__/account-settings.test.tsx` (extend)

**Behaviour (match `05-net-worth.html`, with axes per visual spec §6):**
- Underlined total; note "up/down $X since <Mon>" from `since`; range pills 1M · 6M · 1Y · All (default 6M).
- `NetWorthChart`: lime area over `history`, x-axis month labels, y-axis abbreviated dollars ($400k, $1.2M) masked when hide balances is on, faint dashed gridlines; with one point it shows a single dot and the hand note "History starts today"; empty → nothing drawn.
- Own / Owe tiles with totals; then **Own** and **Owe** lists. "Offsets (n)" expands on tap. Stale manual lines show an `update?` pill. Tapping an account line opens `/account/<id>`.
- `NetWorthRow` on Home: lime row, "Net worth" label, `<Amount>` total, small arrow, the since-note in the hand-drawn style; tap → `/networth`. Hidden when the request fails (Home must never break because of it).

- [ ] **Step 1: Write failing tests**: totals and lists render; Offsets group expands; `update?` pill on stale; range pill change refetches with the new range; hide balances masks the total, tiles, lines and axis labels; Home shows the row and navigates; growth field saves `growthBps: 35` for "3.5" and rejects "25".
- [ ] **Step 2: Run** `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i --forceExit networth account-settings accounts-tab`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat(mobile): net worth screen and Home row`.

### Task 9: Owner format check, docs, verification

**Files:**
- Create: `scripts/commsec-shape.mjs`
- Modify: `README.md` ("Plan 5 setup")

`scripts/commsec-shape.mjs <path-to-csv>` runs with plain `node`, imports nothing from the repo, and prints **no amounts and no names**: the header row, the number of rows, and each distinct `Details` *shape* with a count, where digits become `9`, letters after the first word become `a`, and the first word is kept (e.g. `B 99 aaa @ 99.999999 ×12`, `Direct aaaaaa 999999 aaaaaaaaaaaa ×3`). The owner pastes this output into chat if the import shows skipped rows, so the parser can be fixed without seeing the file.

- [ ] **Step 1:** Write the script with a tiny test (`node --test scripts/commsec-shape.test.mjs`) asserting no digit other than `9` and no lower-case run from the input appears in the output for the Task 1 sample.
- [ ] **Step 2:** README "Plan 5 setup": migrate (expect `applied 0006_holdings.sql`), `npx wrangler deploy` (three crons), new APK; export CommSec CSV (Portfolio → Transactions → Download), import on the phone; if any rows are skipped, run `node scripts/commsec-shape.mjs <file>` and paste the output. Never paste the CSV itself.
- [ ] **Step 3: Full verification:** core `npx vitest run`, api `npx vitest run`, mobile `NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i --forceExit`, `npx tsc --noEmit` in all three, `npx expo install --check` in `apps/mobile`. Expected: all green.
- [ ] **Step 4: Commit** `docs: Plan 5 setup and CommSec shape check`.
- [ ] **Step 5: Phone checks (owner, after deploy):**
  - Import the real CommSec CSV: counts look right; importing again shows everything as "already have".
  - Holdings match CommSec's own portfolio page (units exactly; value within the day's price movement).
  - Net worth total ≈ own − owe by eye; offsets grouped; super shows `update?` when old.
  - Next day: the chart has two points; the Home row shows the since-note.
  - A CommSec payment in CommBank with no trade gives the hint within about an hour of the sync (after 9am); "Not a trade" stops it.

## Not in this plan

These belong to Plan 6 and later:
- projections (ETF, Mortgage, Both), About you, the disclaimer (Plan 6);
- renaming, recolouring and deleting categories; editing rules;
- a notification history screen;
- backfilling net-worth history before the first snapshot;
- dividends and DRP (ignored rows today; holdings count only trades);
- a reminder interval other than 3 months for manual values.
