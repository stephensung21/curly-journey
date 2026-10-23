# Curly Journey v1 — Design

Date: 2026-10-22
Status: approved by owner 2026-10-22
Supersedes for v1 scope: `PLAN.md` (which remains the long-term backlog)

## 1. Intent and why

A single-user, sideloaded Android app that shows one person's money across CommBank, Amex, Up and CommSec in one place.

The owner currently checks three banking apps and is frustrated by two things:

1. **Amex**: the Amex app no longer lets them see spending by calendar month (it is organised around statement periods), and its categorisation is poor compared with CommBank's.
2. **No combined view**: CommBank debit and Amex together carry almost all their spending (Up is used rarely), and no app adds them up by month and category. Nor does any app combine ETFs (CommSec), cash and the mortgage into a net-worth figure, or project ETFs and the mortgage into the future.

The owner will not write code. Claude builds it; the owner reviews, tests on their phone, and does the account sign-ups only they can do.

## 2. Goals (v1)

1. **Accounts list** like the CommBank app: every account grouped by institution, with its balance and last-synced time.
2. **Spending per account**: tap an account to see that month's spend, a category breakdown, and its transactions.
3. **Spending combined**: CommBank + Amex + Up totals for the month, by category, filterable by institution.
4. **Correct categories**: transactions land in the right category; any can be changed, and corrections are remembered.
5. **Totals that track the bank**: balances come from the bank; spending totals exclude transfers.
6. **Spending warnings**: optional limits on overall monthly spend and per category, with alerts.
7. **Bills and dates calendar**: user-added events (repeating or one-off) with alerts before each.
8. **Net worth**: all accounts plus manual entries (AMP super, home value).
9. **Projections**: ETF, mortgage (with offset) and combined views, answering "when do I hit $X", "what will I have at age N", and "what if I add $Y/month".
10. **ETF holdings** from a CommSec CSV import, plus a prompt to add trades.

## 3. Non-goals (v1)

Agreed with the owner to leave out of v1 and possibly add later (see `PLAN.md`):

- Dividends/distributions and franking tracking
- Goals and the FI number
- ETF learn cards, strategy templates and triggered tips
- "Next buy" rebalancing helper and target allocation
- Tax lots and CGT
- Full budgets (only warnings/limits are in scope)
- Real-time CommBank/Amex updates (next-day is accepted)
- AI/Claude features
- Monte Carlo projections, fee/tax drag
- Partner/multi-user, iOS, Play Store

## 4. Anti-goals (would make it a failure even if it works)

- **Transactions in the wrong category**, especially Amex. This is the top priority.
- **Totals that don't track the bank.** The app must never invent a balance or silently show stale data.
- **Being unable to fix a category**, whether it's wrong or missing.
- Super or home value leaking into spending figures.

## 5. Constraints

- **Android only**, sideloaded APK. No Play Store.
- **Single user.** The owner's data only.
- **Data access is read-only.** The app never moves money or places trades.
- **Running cost**: about A$120/yr (PocketSmith Foundation). Everything else (Neon, Cloudflare Workers, Expo/EAS) stays within free tiers.
- **CommBank/Amex data latency is about 1 day**, set by PocketSmith's feed schedule. The owner accepted this.
- **No CommBank, Amex or CommSec personal API exists.** Bank data comes through PocketSmith and holdings through CommSec CSV.
- **All months are calendar months** in `Australia/Sydney` time.
- Strategy and projection content is general information, not advice. A disclaimer is shown on the projection screens.

## 6. Decided by the owner

| Topic | Decision |
|---|---|
| Who builds | Claude builds it; the owner reviews |
| Update speed | Next day is fine for CommBank/Amex |
| Up | Included in spending (used rarely) |
| Home screen | Accounts list, with a "spent this month" card and a money in vs out chart at the top |
| In/out chart | Last-6-months bars by default; a Settings toggle switches to a this-month running-total view |
| Money out | Stacked: mortgage repayments (blue) and other spending (red) |
| Projections layout | One chart with everything on it (target line, age marker, sliders): "layout A" |
| Projections modes | ETFs · Mortgage · Both |
| Mortgage inputs | Balance, rate, repayment, frequency, term, offset balance and growth, extra repayments, rate change |
| Super and home | Manual entries in net worth, with explicit exclusion from spending |
| Budgets | No full budgets; warnings for overall monthly and per-category spend |
| Categories | Copy CommBank's category list for now |
| Category fixes | Must be able to recategorise any transaction, including uncategorised ones |
| Bills calendar | Add repeating and one-off events (e.g. mortgage on the 28th, Amex statement on the 25th, strata, internet, subscriptions) with alerts |
| ETF holdings | CommSec CSV export is acceptable; also a hint alert when a CommSec payment appears |
| Mortgage structure | Single variable loan with **multiple offset accounts**, owned solely by the owner (full loan, home and offsets count in net worth) |

## 7. Claude's calls (owner can override)

| Topic | Call | Reason |
|---|---|---|
| Stack | Expo (React Native, TypeScript) app; **Neon** Postgres (Sydney, `ap-southeast-2`) behind a TypeScript API on **Cloudflare Workers** (Hono), with Workers cron triggers for scheduled jobs and Worker secrets for keys. *Changed 2026-10-23 by the owner from Supabase: their Supabase free-project slots are in use.* | Free tiers; keeps keys and the database off the phone; the Worker runs the same TypeScript as `packages/core` |
| Up connection | Through PocketSmith, not the Up API | Up is rarely used and next-day is fine, so this saves a whole integration. Still within the 6-bank Foundation limit |
| Sync frequency | Poll PocketSmith every 4 hours, plus pull-to-refresh | PocketSmith refreshes feeds roughly daily, so more frequent polling gains nothing |
| Per-account switches | Each account has "counts towards" toggles for Spending, Net worth and Projections | Generalises the owner's super/home exclusion request |
| Warning thresholds | Alert at 80% and 100%, adjustable per limit | Common default |
| Bill alert default | 2 days before, adjustable per event, plus an optional on-the-day alert | Common default |
| Auto-mark bills paid | Match a synced transaction (similar merchant/amount, ±3 days) and tick the event as paid; otherwise ask "Did this get paid?" | Low effort, high value |
| Manual-entry staleness | Nudge if super or home value hasn't been updated for 3 months | Keeps net worth honest |
| Amex statement total | The Amex account screen also shows the statement-period total (cycle ends on the 25th) next to the calendar-month total | So the owner can check it against their statement |
| Projection defaults | 7% return, 2.5% inflation, monthly compounding; option to show today's dollars | Conventional long-run assumptions; editable |
| Navigation | Bottom tabs: Accounts · Spending · Projections · More (Calendar, Net worth, Import, Settings under More) | Fits the agreed scope |
| Feed fallback and history backfill | Generic bank CSV import (CommBank and Amex formats), de-duplicated against feed transactions (§9.12). Used if PocketSmith can't deliver a feed, and to backfill about 6–12 months on day one | PocketSmith often backfills only about 90 days; the 6-month chart and past-match categorisation need history |
| "Track the bank" acceptance | Balances match the bank to the cent as of the last sync. The Amex statement-period total matches the statement. No attempt to match CommBank's own spending insights | Those insights count transfers and refunds differently |
| Rule retroactivity | New rules and corrections apply to new transactions. On creation the app offers "Also update N earlier transactions?". Categories are stored per transaction, not derived on read | Never silently changes months already checked |
| Split transactions | Supported: one transaction can be split across categories by amount | Cheap now, painful to retrofit |
| Payments to other people | Count as spending by default. Any transaction, or a rule for a payee, can be marked "not spending" | Owner can exclude rent or reimbursements without a new transfer type |
| Offset accounts | In Settings, the owner marks which CommBank accounts are offsets for the home loan | The feed doesn't say which accounts are offsets |

## 8. Data sources

| Source | Accounts | Route | What we get |
|---|---|---|---|
| CommBank | Main (pay in, mortgage out), Spending (debit card), Savings, Offset, Home loan | PocketSmith API v2 | Balances and transactions |
| Amex AU | Platinum card | PocketSmith API v2 | Balance and transactions |
| Up | Spending | PocketSmith API v2 | Balance and transactions |
| CommSec | ETF holdings (VDHG, VAS, VGS) | CSV import from CommSec transaction history | Trades, which the app turns into holdings |
| ETF prices | VDHG, VAS, VGS | Free end-of-day price API, refreshed daily after ASX close | Closing prices |
| CoinSpot | Crypto | CoinSpot API v2, read-only key (key and secret are Worker secrets `COINSPOT_KEY` / `COINSPOT_SECRET`); 1–2 calls per sync, inside the 45-call budget | Coin balances valued in AUD |
| AMP super | Super | Manual entry (no Open Banking or member API; no scraping with the owner's password) | Value and as-of date |
| Home | Property | Manual entry | Value and as-of date, optional growth % |
| Mortgage terms | Home loan | Manual entry (the feed gives balance only) | Rate, repayment, frequency, term left |

PocketSmith specifics: developer key (personal use). Endpoints: `users/{id}/transaction_accounts`, `transaction_accounts/{id}/transactions` (incremental via `updated_since`), `users/{id}/categories`. De-duplicate on the PocketSmith transaction ID. Every sync is logged; a failed or stale sync (no successful sync in more than 36 hours) shows a warning on the affected account.

## 9. Behaviour

### 9.1 Accounts (home tab)

Top card:
- "Spent this month" total
- Warning pill when a limit is at 80% or over
- Money in vs out chart:
  - Default: last-6-months bars. Each month has an in bar (teal) and a stacked out bar (mortgage in blue, spending in red). The current month is drawn faded. Tap a month for exact figures.
  - Alternative (Settings): this-month running totals by day, using the same colours.

Below the card:
- Net worth row; tapping it opens the net worth breakdown
- Next 1–2 upcoming calendar events
- Account list grouped by institution: CommBank, Amex, Up, CommSec, Manual

Definitions:
- **Money in** = inflows to Spending-enabled accounts, excluding transfers between own accounts.
- **Money out** = spending + mortgage repayments.
- **Spending** = outflows from Spending-enabled accounts, excluding transfers and mortgage repayments, minus refunds.

### 9.2 Account detail

- Month switcher (‹ October 2026 ›)
- Month total and change vs the previous month
- Category bars
- Transaction list grouped by day, each row showing the clean merchant name and category
- Amex only: statement-period total alongside the calendar-month total

### 9.3 Spending (combined)

- Month switcher; institution filter chips (All · CommBank · Amex · Up)
- Total, with a per-institution split line
- Category bars, with limit markers where set
- A "Not counted as spending" section listing mortgage repayments, card payments and transfers, so exclusions are visible and checkable
- Tap a category to see its transactions

### 9.4 Categorisation

Category list: copy CommBank's spending categories (the builder approximates them; the owner can supply a screenshot to match exactly). Categories are editable data, not code.

Each transaction goes through these steps in order and stops at the first match:
1. **User rules**: description contains X, optionally with amount or account conditions.
2. **Learned corrections**: when the user recategorises, offer "Always do this for <merchant>?"; yes creates a rule.
3. **Past match**: same cleaned merchant → same category as last time.
4. **Built-in AU merchant list**: Woolworths, Coles, Aldi, Bunnings, Kmart, Chemist Warehouse, Opal, energy, telco, streaming and similar, with aliases.
5. **PocketSmith's category**, mapped onto ours.
6. **Uncategorised inbox**: swipe through to assign quickly.

Merchant cleanup: raw descriptions are normalised to clean names (e.g. "WOOLWORTHS 1234 SYDNEY" → "Woolworths").

The app tracks the share of new transactions that reach step 6. The target is under about 5% after 1–2 months of corrections.

Any transaction can be recategorised at any time. Recategorising updates totals immediately.

### 9.5 Transfers and mortgage

- **Transfer detection**: an outflow and an inflow of equal amount between two own accounts within 3 days are paired and excluded from spending and income. This covers Main → Spending, Main → Amex payment and Offset ↔ Main.
- **Mortgage repayments**: identified by destination account (home loan) or rule. Excluded from spending; shown as the blue segment of money out.
- **Refunds**: a credit on a card that isn't a payment is a refund and reduces its category's spend.
- **Corrections**: any transfer or mortgage flag can be toggled per transaction with one tap.
- **Payments to other people** count as spending unless marked "not spending", either per transaction or by a payee rule.
- **Splits**: a transaction can be split into parts, each with its own category and amount. The parts must add up to the transaction total.
- **Offsets**: every account marked as an offset counts as cash in net worth and reduces interest in the mortgage projection. An offset can still be an everyday Spending-enabled account, such as Main.

### 9.6 Spending warnings

- Optional limit on total monthly spend; optional limit per category.
- Alert thresholds of 80% and 100% (adjustable). Each threshold fires once per month per limit.
- Evaluated after every sync; delivered as a push notification and shown on the Home and Spending screens.

### 9.7 Bills and dates calendar

- Event fields: name, optional amount, optional linked account, start date, repeat (none / weekly / fortnightly / monthly on day N / quarterly / yearly), alert lead time (default 2 days), on-the-day alert on/off.
- Owner's starting events: mortgage repayment (monthly, 28th) and Amex statement closes (monthly, 25th). Others to add: strata, internet, subscriptions.
- Views: month grid with dots on event days, plus an upcoming list. The next 1–2 events also appear on Home.
- Auto-paid: a synced transaction within ±3 days with a similar merchant or amount ticks the event off as paid. If the due date passes with no match, the app asks "Did this get paid?".

### 9.8 Net worth

- **Assets**: CommBank balances (incl. offset), Up, CommSec holdings at the latest close, CoinSpot (AUD value), AMP super (manual), home (manual, optional annual growth %).
- **Liabilities**: home loan, Amex balance.
- **Display**: headline figure, a history chart (from daily snapshots taken by the backend), and a breakdown list.
- **Per-account toggles**:

| Account | Spending | Net worth | Projections |
|---|---|---|---|
| Everyday CommBank, Amex and Up accounts | on | on | off |
| Super, home, CoinSpot | off (locked off by default, can't be counted as spending unless the owner changes it explicitly) | on | off |
| CommSec | off | on | ETF |
| Home loan, offset | off | on | Mortgage |

### 9.9 ETF holdings and CommSec import

- Import the CommSec transaction history CSV: parse buys and sells (date, ticker, units, price, brokerage) and de-duplicate re-imported rows.
- Holdings = units per ETF. Value = units × latest close. Also show average cost and unrealised gain ($ and %).
- **Manual trade entry** as a fallback.
- **Hint alert**: when a transaction to CommSec appears in a CommBank feed with no matching trade recorded within ±5 days, send a push notification: "Looks like you bought something on CommSec. Import or add the trade?"
- Average monthly investment, used by projections, = net buys over the last 12 months ÷ 12.

### 9.10 Projections (layout A)

One screen with a mode toggle: **ETFs · Mortgage · Both**.

**ETFs mode**
- Headline: projected value at the chosen age.
- Chart: stacked area of contributions vs growth; dashed target line labelled with the year it's hit; vertical marker at the chosen age.
- Inputs (pre-filled from real data, editable): starting value, monthly contribution, expected return, target amount, age; toggle for today's dollars (inflation).
- Moving any input updates the headline, the target year and the at-age value live.

**Mortgage mode**
- Headline: mortgage-free date, plus how much sooner than the term thanks to the offset.
- Chart: loan balance with offset (solid) vs without offset (dashed); offset balance as an area.
- Figures: interest saved by the offset, total interest remaining.
- Inputs: balance (from the feed), rate, repayment and frequency, term left, offset balance (from the feed) and monthly growth, extra repayments, rate change.
- Maths: monthly amortisation; interest charged on (loan − **sum of all linked offset balances**), floored at 0. "Offset balance" and "grows by" in the inputs are the combined figure across all offsets.

**Both mode**
- Chart: ETF value and mortgage owing on one chart, with the crossover year marked and the age marker.
- Headline: the year ETFs overtake the mortgage; at the chosen age, ETFs, loan and net figures.
- **Offset vs invest**: "Spare $X/month goes to offset → pays off N years sooner" vs "→ ETFs, +$Y at age Z". Uses the mortgage rate, the expected return, and the owner's marginal tax rate applied to an assumed distribution yield.

The owner's birth date and marginal tax rate are stored once in Settings.

### 9.11 Notifications

Types:
- spending warning
- bill/date alert
- "did this get paid?"
- CommSec trade hint
- sync failure (no successful sync in more than 36 hours)
- manual-entry staleness (3 months)

Each type can be turned on or off in Settings.

### 9.12 Bank CSV import (fallback and backfill)

- Import CommBank and Amex transaction CSVs into an existing account.
- De-duplicate against feed transactions by date, amount and normalised description. Show the user a preview of new vs duplicate rows before committing.
- Imported transactions go through the same categorisation pipeline.

### 9.13 Security

- **On the phone**: biometric or PIN lock on open and after 5 minutes in the background. A hide-balances toggle. A privacy cover while the app is in the background. **Screenshots stay allowed** (owner decision 2026-10-23): no Android secure-window flag, so on some phones the app-switcher thumbnail may briefly show balances; Hide balances avoids this.
- **Secrets**: PocketSmith and price API keys live only in the backend's secret store, never in the APK.
- **Database**: never reachable from the phone. Only the Cloudflare Worker holds the Neon connection string (as a Worker secret). Single user: the app authenticates to the Worker with a long-lived random API token (≥32 bytes), created once at setup, stored only in the phone's secure storage (`expo-secure-store`) behind the app lock, and stored server-side as a hash. The token can be rotated from Settings. All Worker routes require it except the health check. HTTPS only.
- **Accounts**: 2FA on Neon, Cloudflare, PocketSmith and Expo (owner action).

## 10. Visual design direction

> **Superseded** by `2026-10-22-curly-journey-v1-visual-design.md`. The owner chose a dark, playful look with hand-drawn crayon touches instead of the calm cream/teal direction below. The text below is kept for history only.

Calm, Pearler-inspired feel, used for its feel only and not copied:

- **Colour**: deep navy/teal (`#13343b`, `#1f6f6a`) on a cream background (`#f6f3ec`) with white cards.
  - Chart colours: teal for money in, blue for mortgage, red for spending, coral for the target line and warnings.
- **Shapes**: large rounded cards (16–20px radius), pill buttons and segmented toggles.
- **Type**: a geometric sans (Inter or DM Sans); big bold numbers and small muted labels. Body text at least 14px in the real app.
- **Patterns**: CommBank-style account tiles and day-grouped transaction lists; swipe to categorise.
- **Modes**: light mode first; dark mode later. (Superseded: both modes in v1; see the visual design doc.)

Approved mockups from the brainstorm are kept in `.superpowers/brainstorm/1730-1792591203/content/`:
- `projections-layout.html` (option A chosen)
- `projections-mortgage.html`
- `spending-flow.html`
- `home-screen-v2.html`

A fuller visual design pass (all screens, tokens, components) follows this document.

## 11. Suggested build order

1. **Foundations**: repo, Expo shell with tabs and design tokens, biometric lock, first APK on the phone.
2. **Bank sync**: PocketSmith sync, bank CSV import and backfill, accounts list, account detail, sync health.
3. **Spending**: categorisation pipeline, recategorise and inbox, transfer and mortgage detection, combined spending, Home in/out chart.
4. **Warnings and calendar**: limits, bill events, alerts, auto-paid matching. Also (owner request, 2026-10-24): the CoinSpot feed and the manual AMP super account with its 3-month update nudge, pulled forward from step 5.
5. **Holdings and net worth**: CommSec import, prices, manual entries, net worth and snapshots, trade hint.
6. **Projections**: ETF, mortgage and Both modes, with unit tests on the projection and amortisation maths.

## 12. Left to the builder

- Database schema details (start from `PLAN.md` §4 and trim to v1)
- Choice of price API, chart library and notification plumbing
- Exact merchant list and alias seeding
- Exact mapping of PocketSmith categories to CommBank categories
- Transfer-matching tolerance tuning
- Empty, loading and error states
- Unit tests for money maths (integer cents), projections, amortisation and CSV parsing

## 13. Owner actions required

- Sign up for PocketSmith Foundation (annual) and connect CommBank, Amex and Up. Confirm that the home loan and offset come through with transactions. Check whether AMP appears as a feed.
- Create the PocketSmith developer key, a Neon project (Sydney region) and a free Cloudflare account; turn on 2FA on all three.
- Export a sample CommSec transaction-history CSV so the parser can be built against the real format.
- Export 6–12 months of CommBank and Amex transaction CSVs for the history backfill.
- Optionally, a screenshot of CommBank's category list.
- Enable "Install unknown apps" on the phone to sideload the APK.
