# Curly Journey — Personal Finance & Investing App

**Plan and feature list**

A personal app that combines:

1. **Everyday money**: spending, accounts and cash flow across CommBank, Amex and Up, in the style of the CommBank and Amex apps.
2. **Net worth and debt**: CommBank everyday accounts, the mortgage (and offset) and CommSec holdings in one place.
3. **Long-term investing**: portfolio, goals, dividends, compounding projections and ETF strategy guidance for VDHG, VAS and VGS, with a calm, goal-first look inspired by Pearler.

> **Disclaimer to show in the app:** strategy content is general information, not personal financial advice. Fund facts (fees, distribution frequency, allocations) change over time. Store them as editable data and check them against the issuer (Vanguard) rather than hard-coding them.

---

**Platform:** Android only (native app, sideloaded).

## 1. Data sources and how to connect them

| Source | What we need | Best route | Notes |
|---|---|---|---|
| **CommBank** everyday + savings | Transactions, balances | **PocketSmith API** (bank feed) | CommBank has no personal developer API. Going direct through Open Banking (CDR) needs ADR accreditation, which isn't realistic for one person. |
| **CommBank Home Loan** (+ offset) | Balance, repayments, interest | **PocketSmith API** (bank feed) | Treat it as a liability. Interest charges become transactions. |
| **Amex (AU)** | Card transactions, statement balance | **PocketSmith API** (bank feed) | Card refunds and payments must be detected so they aren't counted as spending or income. |
| **Up Bank** | Transactions, balances, categories, tags | **Up public API** (direct) *or* PocketSmith | Up gives you a personal access token and supports **webhooks**, so transactions can arrive in real time. Direct is better than going through PocketSmith. |
| **CommSec** | Holdings, trades, cost base | **CSV import** + manual trade entry | Aggregator feeds usually give only a cash/total balance, not per-holding detail or cost base. CommSec exports transaction history as CSV; parse that to rebuild the holdings. |
| **ETF prices** | VDHG/VAS/VGS end-of-day prices | Market data API (e.g. EODHD, Alpha Vantage, Marketstack, Yahoo `VAS.AX`) | End-of-day data is enough for a long-term investing app. Cache it daily. |
| **Distributions** | Ex-date, pay date, cents per unit, franking | Market data API + manual or CSV entry | Vanguard publishes distribution history. Also allow entering the AMIT/tax statement figures. |

### PocketSmith integration specifics
- Use the **PocketSmith API v2** with a **developer key** (personal use) or OAuth if the app is ever shared.
- Endpoints we'll use: `users/{id}/transaction_accounts`, `transaction_accounts/{id}/transactions`, `users/{id}/categories`, `institutions`.
- PocketSmith refreshes the bank feeds on its own schedule. Our backend **polls incrementally** (e.g. every 2–4 hours, plus pull-to-refresh) using `updated_since`, and de-duplicates on the PocketSmith transaction ID.
- Feed availability depends on your PocketSmith plan. The free plan has no bank feeds.
- **Cost (reported Oct 2026, confirm at my.pocketsmith.com/plans):** Foundation is ~A$14.95/mo, or ~A$9.99/mo billed annually (~A$120/yr), and covers 6 banks from one country. Flourish (18 banks, any country) and Fortune (unlimited) cost more. **Foundation is enough here:** CommBank (everyday, offset and mortgage count as one bank), Amex and CommSec make 3 banks, and Up connects directly.
- **Decide early:** let PocketSmith own categorisation (simpler) *or* keep our own categories and rules (more control, closer to the CommBank and Amex apps). Recommendation: import PocketSmith's category as a starting point, but our own rules engine has the final say.

---

## 2. Feature list

Priority: **P0** = MVP, **P1** = next, **P2** = later or nice-to-have.

### A. Home / overview (Pearler-style "everything at a glance")
- **P0** Net worth headline (assets − liabilities) with a 1M/6M/1Y/All sparkline
- **P0** Card stack: Cash · Investments · Mortgage · Credit cards
- **P0** "This month" spend vs last month and vs budget
- **P1** Goal progress rings for your top 3 goals
- **P1** Next dividend expected (amount and date)
- **P2** Weekly "money moment" summary (push notification)

### B. Accounts and transactions (CommBank/Amex-style)
- **P0** All accounts list grouped by institution, with balances and last-synced time
- **P0** Unified transaction feed: search, filter (account, category, date, amount), and pending vs posted
- **P0** Merchant cleanup (e.g. "WOOLWORTHS 1234 SYDNEY" → "Woolworths") with logos
- **P0** Categorisation, plus **rules** ("always categorise X as Y")
- **P0** Transfer detection (e.g. CommBank → Amex payment, offset → loan) so transfers don't count as spending
- **P1** Split transactions, notes, tags, receipt photo
- **P1** Amex-specific: statement cycle view, due date, statement balance vs current balance, refund/credit matching
- **P1** Up-specific: carry over Up tags and "Savers", plus real-time webhook notifications
- **P2** Recurring transaction and subscription detection ("You pay $22.99/mo to Netflix")

### C. Spending insights and budgets
- **P0** Spending by category: donut + month-on-month bars
- **P0** Monthly budgets per category with progress bars and over-budget alerts
- **P1** Cash-flow view: income vs expenses vs **invested** (savings rate %)
- **P1** "Where did my money go" merchant leaderboard
- **P2** Upcoming bills calendar (from detected recurring payments)
- **P2** Australian financial-year (Jul–Jun) reports and CSV export

### D. Mortgage and debt
- **P0** Loan balance, interest rate, repayment amount and frequency
- **P0** Offset balance and **interest saved by the offset** (monthly and to date)
- **P1** Payoff projection: payoff date, total interest, effect of extra repayments
- **P1** **Offset vs invest calculator**: compare putting $X into the offset with investing it in VDHG/VAS/VGS. Inputs: your mortgage rate, your marginal tax rate and an assumed return. Very relevant for Australian investors with a home loan.
- **P2** Equity tracking (manually entered property value or an estimate API)

### E. Portfolio (Pearler-style)
- **P0** Holdings: units, average cost, market value, unrealised gain ($ and %), portfolio weight
- **P0** Portfolio value over time chart
- **P0** CommSec CSV import (buys and sells), plus manual trade entry (incl. brokerage)
- **P0** **Target allocation vs actual** (e.g. VAS 40% / VGS 60%) with a drift indicator
- **P1** **"Next buy" helper:** given $X to invest, which ETF(s) to buy to rebalance *using new money* (no selling), allowing for brokerage and minimum parcel size
- **P1** Look-through exposure: asset class, region (Australia / US / Europe / emerging…), hedged vs unhedged. For example, VDHG is split into its underlying funds.
- **P1** Fee drag: weighted portfolio MER ($/yr)
- **P1** Performance: time-weighted and money-weighted (XIRR) returns, with and without dividends
- **P2** Tax lots and CGT: per-parcel cost base, 12-month CGT discount eligibility date, sell-lot simulation (FIFO / minimise-tax)

### F. Dividends / distributions
- **P0** Distribution history per ETF and in total, by month and by financial year
- **P0** Upcoming distributions: ex-date, pay date and estimated amount (units × last cents-per-unit)
- **P1** **Franking credits** tracking (mainly VAS) and grossed-up yield
- **P1** DRP (dividend reinvestment plan) vs cash: record DRP units allotted with their cost base
- **P1** Passive income chart: "your portfolio paid you $X this year, $Y/month on average"
- **P2** Annual tax statement (AMIT) entry/import to reconcile cost-base adjustments

### G. Goals (goal-based investing)
- **P0** Create goals: name, target amount, target date, icon/colour (e.g. "House deposit", "Kids' education", "Financial independence")
- **P0** Link funding sources to a goal: whole portfolio, specific ETFs, an Up Saver or the offset
- **P0** On-track indicator: required monthly contribution vs actual
- **P1** **FI number:** annual expenses (from spending data!) ÷ withdrawal rate (e.g. 4%), and time to FI
- **P1** Milestones and celebrations ($10k, $50k, $100k invested; first $1k of dividends)
- **P2** Scenarios: "what if I add $200/mo more?" / "what if I retire 3 years earlier?"

### H. Compounding projections
- **P0** Calculator: starting balance, regular contribution (weekly/fortnightly/monthly), years, expected return, inflation
- **P0** Chart showing **contributions vs growth**, so the compounding is visible
- **P1** Nominal vs real (inflation-adjusted) values
- **P1** Fees and tax drag toggle (MER, tax on distributions at your marginal rate)
- **P1** Pre-filled from your real data (current portfolio value, average monthly investing)
- **P2** Monte Carlo range (10th / 50th / 90th percentile bands) instead of a single line

### I. ETF strategies and tips (VDHG / VAS / VGS)
Delivered as short, Pearler-style "learn" cards and linked from the screens they relate to.

- **P0** ETF profile pages for VDHG, VAS and VGS: what each holds, index, MER, distribution frequency, DRP availability, top holdings and region split (data editable/refreshable)
- **P0** Strategy templates you can apply as your target allocation:
  - **"One-fund" — 100% VDHG.** About 90% growth / 10% defensive, auto-rebalanced, the simplest option. Higher MER than DIY, and you can't customise it.
  - **"DIY two-fund" — VAS + VGS** (e.g. 30/70, 40/60, 50/50). Lower fees, you choose the home-bias, but you rebalance yourself.
  - **"Core + satellite".** A VDHG or VAS/VGS core plus small tilts (e.g. emerging markets, small caps, a hedged version).
- **P1** Comparison tool: VDHG vs a VAS/VGS mix covering fee difference in $ over 10/20/30 years, the Australian-share weighting, and complexity
- **P1** Tips library (contextual):
  - Brokerage drag: invest less often in larger amounts (e.g. a $5 fee on $500 is 1%, on $2,000 it's 0.25%)
  - Rebalance with new contributions instead of selling (avoids CGT)
  - Hold more than 12 months for the 50% CGT discount
  - Franking credits and why VAS distributions look "lumpier" in tax terms
  - DRP vs taking cash (DRP buys without brokerage but makes cost-base records more complex)
  - Distributions are typically lumpier in the June quarter
  - Market drops: stay the course, and show your personal history of dips and recoveries
  - Offset vs investing (links to the calculator)
- **P2** "Autoinvest plan" reminders: a schedule (e.g. fortnightly on payday) plus the Next buy suggestion and a "mark as done" step. The app does not place trades; CommSec has no trading API.

### J. Platform, security and settings
- **P0** Biometric / PIN lock, auto-lock, hide-balances toggle (like the CommBank app)
- **P0** All bank tokens stored server-side and encrypted. Read-only access only.
- **P0** Manual accounts and assets (super, car, cash) for net-worth completeness
- **P1** Notifications: large transaction, over budget, dividend paid, goal milestone, sync failure
- **P1** Light and dark mode
- **P2** Super fund tracking (manual or CSV), multi-user/partner view, data export/backup

---

## 3. Design direction (Pearler-inspired, not a copy)

Use Pearler's *feel*, not its brand assets or wording:

- **Tone:** calm and long-term. Lead with progress toward goals rather than daily price movement. Don't show daily % change in red by default; make it a setting.
- **Palette:** deep teal/navy primary, soft mint and cream backgrounds, one warm accent (coral or gold) for milestones. Generous whitespace.
- **Shapes:** large rounded cards (16–20px radius), soft shadows, pill buttons, progress rings for goals.
- **Typography:** a friendly geometric sans (e.g. Inter, Manrope, DM Sans), large bold numbers for balances and small muted labels.
- **Illustration:** simple friendly illustrations for empty states and milestones (custom or open-licence).
- **Navigation (bottom tabs):** `Home` · `Spending` · `Invest` · `Goals` · `More`
- **Banking screens** borrow the CommBank/Amex patterns people already know: account tiles at the top, a transaction list grouped by day, tap for detail, and swipe to categorise.

### Key screens
1. Home: net worth, card stack, goals, upcoming dividend
2. Accounts → Account detail → Transaction detail
3. Spending: categories, budgets, cash flow
4. Invest: portfolio, holdings, allocation, Next buy
5. ETF detail (VDHG/VAS/VGS) with learn cards
6. Dividends: calendar and history
7. Goals: list, goal detail, create goal
8. Projections: compounding calculator
9. Mortgage: loan, offset, offset-vs-invest
10. Settings: connections (PocketSmith, Up), security, imports

---

## 4. Recommended architecture

```
 ┌───────────────┐      ┌──────────────────────────┐      ┌──────────────────┐
 │ Android app   │◄────►│  Backend API (TypeScript) │◄────►│  Postgres         │
 │ Expo / React  │ HTTPS│  - sync jobs (cron)       │      │  (Supabase)       │
 │  Native       │      │  - Up webhook receiver    │      └──────────────────┘
 └───────────────┘      │  - rules / categoriser    │
                        │  - portfolio engine       │──► PocketSmith API v2
                        │  - projections            │──► Up API (+ webhooks)
                        └──────────────────────────┘──► Market data (EOD prices)
```

- **App:** Android only. Expo (React Native + TypeScript) native build, with fingerprint/face unlock via `expo-local-authentication` and push notifications via Expo Notifications (FCM). Charts via `victory-native` or `react-native-skia`.
- **Android extras:** home-screen widget (net worth / this month's spend), notification-driven quick categorise.
- **Install:** build a signed APK with EAS Build (free tier) or locally with Gradle, then sideload it (allow "Install unknown apps"). No Play Store listing is needed.
- **Backend:** Supabase (Postgres + Auth + Edge Functions + scheduled jobs), or a small Node/Hono service. API keys never live on the device.
- **Jobs:** PocketSmith sync (every 2–4h), price refresh (daily after ASX close, ~4:30pm AEST/AEDT), distribution refresh (weekly), recurring-detection (nightly).
- **Money maths:** store amounts as integer cents and units as decimals with fixed precision. Do all money calculations on the backend so they're consistent.
- **Testing:** unit tests for the portfolio engine (cost base, XIRR, rebalancing, CGT dates) and the projections. These are where silent bugs cost money.

### Core data model (first cut)
- `institution` (CommBank, Amex, Up, CommSec, Manual)
- `account` (type: transaction | savings | offset | credit_card | mortgage | brokerage | manual_asset; source; external_id; currency)
- `transaction` (account, date, amount_cents, description_raw, merchant_id, category_id, is_transfer, transfer_pair_id, status, external_id, source)
- `merchant`, `category`, `rule` (match conditions → category/merchant/tags)
- `budget` (category, period, amount)
- `security` (ticker, name, MER, distribution_frequency, issuer, metadata JSON for allocation/regions)
- `price` (security, date, close)
- `trade` (account, security, date, type buy/sell/drp, units, price, brokerage)
- `distribution` (security, ex_date, pay_date, cpu, franking_pct) + `distribution_received` (account, units_held, cash, drp_units)
- `target_allocation` (security, weight)
- `goal` (name, target, date, funding links)
- `loan_details` (account, rate, repayment, frequency, offset_account_ids)
- `sync_log` (source, started, finished, status, error)

---

## 5. Delivery roadmap

| Phase | Scope | Outcome |
|---|---|---|
| **0. Foundations** (wk 1–2) | Repo setup, Expo app shell + design system (colours, type, cards, tabs), Supabase schema, auth + biometric lock, first APK installed on your phone | Clickable shell in the Pearler-inspired style |
| **1. Banking MVP** (wk 3–5) | PocketSmith sync (CommBank, Amex, mortgage), Up API + webhooks, unified feed, categories and rules, transfer detection, Home net worth | Replaces day-to-day checking across 3 apps |
| **2. Spending** (wk 6–7) | Budgets, category insights, cash flow and savings rate, recurring detection | Know where the money goes |
| **3. Portfolio** (wk 8–10) | CommSec CSV import, trades, prices, holdings, performance, target allocation + Next buy | Your CommSec ETFs tracked properly |
| **4. Dividends & goals** (wk 11–12) | Distributions + franking, upcoming dividends, goals with on-track tracking, FI number | Goal-based investing view |
| **5. Projections & learn** (wk 13–14) | Compounding calculator, ETF profiles, strategy templates, VDHG-vs-DIY comparison, tips library | Pearler-style guidance |
| **6. Mortgage & polish** (wk 15–16) | Offset savings, payoff projection, offset-vs-invest, notifications, dark mode, FY reports | Complete personal finance hub |

---

## 6. Personal running costs

This is a single-user personal app, so it only needs personal costs: no business accreditation, no commercial Open Banking agreements and no paid tiers built for scale.

| Item | Cost | Notes |
|---|---|---|
| PocketSmith Foundation | ~A$120/yr (annual) | Required: the only route to CommBank and Amex feeds. Confirm pricing at my.pocketsmith.com/plans. |
| Up API | Free | Personal access token. |
| ETF prices | Free | End-of-day prices for 3 ETFs once a day fits within free API limits. |
| Supabase (Sydney region) | Free | Free tier is ample for one user. Free projects pause after inactivity, which the daily sync jobs prevent. |
| App distribution | Free | Android only: sideload a signed APK built with EAS Build (free tier) or Gradle. No Apple Developer account, and a Play Store account (US$25 one-off) is optional. |
| Domain | Optional (~A$15–25/yr) | The free hosting URL works fine. |

**Minimum total: ~A$120/yr** (just PocketSmith).

---

## 7. Risks and open questions

- **PocketSmith feed coverage and reliability:** confirm CommBank home loan/offset and Amex AU appear with transactions (not just balances) on your plan. Build a sync-health screen.
- **CommSec has no API:** holdings depend on CSV import. Keep the parser tolerant of format changes and support contract-note-style manual entry.
- **Market data licensing:** free APIs can be rate-limited or unofficial. Pick a paid end-of-day provider if reliability matters.
- **Advice boundary:** keep strategy content general, not "you should buy X". Show the disclaimer.
- **Security:** this app holds your full financial picture. Use encrypted secrets, row-level security in Postgres, no tokens on the device, and 2FA on the backend account.
- **Open questions for you:**
  1. Use PocketSmith's categories, or our own rules from day one?
  2. Do you use DRP on any of VDHG/VAS/VGS?
  3. Is the app just for you, or also for a partner (shared household view)?
  4. Should super be in scope for net worth and FI calculations?
