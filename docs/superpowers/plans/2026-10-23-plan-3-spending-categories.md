# Plan 3: Spending and Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every synced or imported transaction gets a clean merchant name, a category and a "counts as" flow. The owner can fix any of them, and fixes are remembered. Spending totals by month and category exclude transfers and mortgage repayments. The Spending tab, the account Categories page and the Home hero card with the money in/out chart show real figures.

**Architecture:**
- **Pure logic in `packages/core`:**
  - merchant cleanup;
  - the seed category list;
  - the categorisation pipeline;
  - transfer and mortgage detection;
  - spending aggregation.

  All of it is unit-tested with plain data.
- **The Worker runs a post-sync pipeline.** After each sync or CSV import, it:
  1. stores clean merchant names;
  2. categorises new rows;
  3. re-detects transfers over the affected date window.

  Aggregation happens in the Worker. It loads a month's spend lines and passes them to core's `summarise`, so every screen uses the same maths.
- **Categories are stored per transaction, never derived on read.** Rows the owner changed are never overwritten by automation.
- **Mobile:**
  - new screens: transaction detail, inbox and category drill-down;
  - a real Spending tab;
  - the account detail pager;
  - the Home hero card with an SVG in/out chart drawn with `react-native-svg`, which is already installed.

**Tech Stack:**
- Everything from Plans 1 and 2.
- One new native module, `expo-intent-launcher` (Task 15). Swipes use React Native's `PanResponder` and `Animated`. The pager is a horizontal `ScrollView` with `pagingEnabled`. Sheets are a transparent `Modal`.
- The APK is rebuilt once at the end (Task 14) to ship the new JavaScript and `expo-intent-launcher`.

**Spec:** `docs/superpowers/specs/2026-10-22-curly-journey-v1-design.md` (§7 rows "Rule retroactivity", "Split transactions", "Payments to other people", "Amex statement total", "Track the bank"; §9.1 definitions; §9.2–§9.5) and `docs/superpowers/specs/2026-10-22-curly-journey-v1-visual-design.md` (§3, §5, §5.1, §6, screens H, S, 1, 2, 3, §8a). Executors read both.

## Global Constraints

- Everything from Plans 1 and 2 still applies:
  - integer cents;
  - `Australia/Sydney` calendar months;
  - `<Amount>` for every dollar figure, and hide balances masks chart y-axis labels too;
  - all SQL lives in `apps/api/src/db/repo.ts`;
  - auth on every route except `/health`;
  - secrets only in Worker secrets.
- **Never overwrite the owner.**
  - A row with `category_source = 'user'` keeps its category through re-sync, rules, past matches and pipeline reruns.
  - A row with `flow_source = 'user'` keeps its flow through transfer re-detection.
  - The only way to change a user-set row is the owner editing it again, or applying a rule to past rows with "Also update N earlier transactions" on. That bulk update also skips user-set rows.
- **Flow values:** `normal` | `transfer` | `mortgage` | `not_spending`.
- **Category kinds:** `spending` | `income`. "Transfer" and "Uncategorised" are not categories:
  - a transfer is `flow = 'transfer'`;
  - an uncategorised row is `category_id is null`.
- **Definitions (spec §9.1).** They apply to rows on accounts with `counts_spending = true`, and to split parts where splits exist.
  - **Spending** = −Σ `amount_cents` over rows with `flow = 'normal'` whose category is null or of kind `spending`. Refunds are positive, so they reduce their category automatically.
  - **Money in** = Σ `amount_cents` over rows with `flow = 'normal'` and a category of kind `income`.
  - **Mortgage** = −Σ `amount_cents` over rows with `flow = 'mortgage'`.
  - **Money out** = Spending + Mortgage.
- **Pending rows count in totals.** Sync reconciles them (Task 4), so a pending row replaced by a posted row with a new ID disappears.
- **Pipeline order (spec §9.4).** Stop at the first match:
  1. user rules (`origin = 'user'`);
  2. learned rules (`origin = 'learned'`);
  3. past match: the most recent row with the same `merchant` and `category_source = 'user'`;
  4. the built-in AU merchant list;
  5. the PocketSmith category map;
  6. if nothing matched: a positive amount on a non-credit-card account becomes **Income** (`category_source = 'default'`). Anything else stays uncategorised and goes to the inbox.
- **`category_source` values:** `rule` | `learned` | `past` | `merchant` | `pocketsmith` | `default` | `user` | null.
- **`initial_source`** is copied from `category_source` the first time the pipeline runs on a row, and never changed afterwards. The auto-sort % is computed from it.
- **Transfer pairing (spec §9.5):**
  - Pair an outflow with an inflow of exactly the opposite amount on a different account, dated within **3 days**.
  - Pick the closest date first, then the lowest ID. Each row pairs at most once.
  - If the inflow is on a `mortgage`-kind account, the outflow becomes `mortgage` and the inflow `transfer`. Otherwise both become `transfer`.
  - Unpaired keyword fallbacks:
    - an outflow matching `/HOME ?LOAN|LOAN REPAYMENT|MORTGAGE/i` → `mortgage`;
    - a credit-card inflow matching `/PAYMENT|THANK YOU/i` → `transfer`;
    - a bank outflow matching `/AMEX|AMERICAN EXPRESS/i` → `transfer`.
- **Amex statement period** for month `YYYY-MM` = the 26th of the previous month to the 25th of `YYYY-MM`, both inclusive.
- **Copy is exact.** Use the strings quoted in each task verbatim. Warnings and errors are plain text, never Caveat.

## Review Focus

1. **A pending transaction replaced by a posted one with a new PocketSmith ID** must not be counted twice. Sync re-fetches the last 14 days without `updated_since` and deletes PocketSmith rows in that window that the feed no longer returns. This is deferred Important 4 from Plan 2. Pinned in Task 4.
2. **Owner edits survive automation.** After a user recategorises a row or sets its flow, a full re-sync, a new rule (without "also update"), and transfer re-detection must leave it unchanged. Pinned in Task 5.
3. **Amex refunds and payments.** A $40 refund at a shop on Amex reduces Shopping by $40. The "PAYMENT RECEIVED - THANK YOU" credit is a transfer, not income and not a refund. Pinned in Tasks 3 and 5.
4. **Period edges:**
   - a transaction on the 1st, or on the last day of the month, lands in that Sydney month;
   - the December statement period runs from 26 Nov to 25 Dec;
   - the January statement period runs from 26 Dec of the previous year to 25 Jan.

   Pinned in Task 3.
5. **Ambiguous transfers.** Two −$500 outflows and two +$500 inflows within 3 days must form two pairs, each row used once, by closest date. A lone −$500 with no partner stays `normal`. Pinned in Task 3.

## File map

```
packages/core/src/spending/categories.ts   SEED_CATEGORIES, CategorySeed
packages/core/src/spending/merchant.ts     cleanMerchant, MERCHANTS, merchantCategory, institutionGroup
packages/core/src/spending/pocketsmithCategory.ts  mapPocketSmithCategory
packages/core/src/spending/categorise.ts   Rule, CategoriseInput, categorise, ruleMatches
packages/core/src/spending/flows.ts        FlowTxn, detectFlows
packages/core/src/spending/summarise.ts    SpendLine, summarise, statementPeriod, monthPeriod, inOutByMonth, runningByDay
packages/core/test/spending/*.test.ts

apps/api/migrations/0002_spending.sql
apps/api/src/db/repo.ts                    + categories, rules, splits, lines, pipeline queries
apps/api/src/sync/runSync.ts               + reconcile window, ps_category, merchant, post-sync pipeline
apps/api/src/spending/pipeline.ts          runPipeline(repo, { since })
apps/api/src/routes/{transactions,categories,rules,spending}.ts
apps/api/test/{pipeline,transactions,rules,spending}.test.ts

apps/mobile/src/api/{types,hooks}.ts       + new DTOs and hooks
apps/mobile/src/lib/days.ts                dayHeader, plainDay, sydneyDate (moved out of app/account/[id].tsx)
apps/mobile/src/theme/categoryColor.ts     token name → hex
apps/mobile/src/components/{Sheet,CategoryPicker,CategoryBar,TransactionList,InOutChart}.tsx
apps/mobile/src/components/TransactionRow.tsx   (upgraded)
apps/mobile/app/transaction/[id].tsx       detail, remember sheet, counts as, split, note
apps/mobile/app/inbox.tsx
apps/mobile/app/category/[id].tsx          drill-down
apps/mobile/app/rules.tsx
apps/mobile/app/(tabs)/spending.tsx        real
apps/mobile/app/(tabs)/index.tsx           + hero card and chart
apps/mobile/app/account/[id].tsx           + pager, totals, statement toggle
```

---

### Task 1: Categories, merchant cleanup, PocketSmith map (core)

**Files:** create `packages/core/src/spending/{categories,merchant,pocketsmithCategory}.ts` and export them from `src/index.ts`. Tests go in `packages/core/test/spending/merchant.test.ts`.

**Interfaces (Produces):**
```ts
type CategoryColor = 'orange' | 'lime' | 'blue' | 'yellow' | 'pink' | 'purple' | 'line';
type CategorySeed = { name: string; emoji: string; color: CategoryColor; kind: 'spending' | 'income' };
SEED_CATEGORIES: readonly CategorySeed[]
cleanMerchant(raw: string): string
MERCHANTS: readonly { name: string; aliases: string[]; category: string }[]   // category = a SEED_CATEGORIES name
merchantCategory(merchant: string): string | null                           // seed category name
mapPocketSmithCategory(title: string | null): string | null                 // seed category name
institutionGroup(institution: string): string   // 'CommBank' | 'Amex' | 'Up' | the input unchanged
```

`SEED_CATEGORIES`, in this order (name, emoji, colour, kind):
- Groceries, 🛒, lime, spending
- Dining out, 🍜, orange, spending
- Coffee, ☕, orange, spending
- Transport, 🚗, yellow, spending
- Shopping, 🛍️, pink, spending
- Bills & utilities, 💡, blue, spending
- Entertainment, 🎬, purple, spending
- Subscriptions, 📺, pink, spending
- Health, 🏥, blue, spending
- Home, 🏠, blue, spending
- Insurance, 🛡️, blue, spending
- Personal care, 💇, pink, spending
- Education, 🎓, purple, spending
- Travel, ✈️, yellow, spending
- Gifts & donations, 🎁, pink, spending
- Pets, 🐾, yellow, spending
- Fees & interest, 🏦, purple, spending
- Cash, 💵, lime, spending
- Government & tax, 🏛️, purple, spending
- Other spending, 📦, line, spending
- Income, 💰, lime, income

`cleanMerchant` steps:
1. Strip these prefixes: `SQ *`, `SMP*`, `PAYPAL *`, `ZLR*`, `LS `, `EFTPOS `, `VISA DEBIT PURCHASE `.
2. Strip `Card xx\d+`, `Value Date: …`, a trailing `AU`/`AUS`, a trailing state code (`NSW|VIC|QLD|SA|WA|TAS|ACT|NT`), and any run of 3 or more digits.
3. Collapse whitespace.
4. If an entry in `MERCHANTS` has an alias that is a prefix of the uppercased result, return that entry's `name`.
5. Otherwise return the first 3 words in Title Case.

`MERCHANTS` must cover at least these, with aliases:
- Woolworths (WOOLWORTHS, WW METRO), Coles (COLES), Aldi (ALDI), IGA (IGA): Groceries;
- Bunnings (BUNNINGS): Home;
- Kmart (KMART), Target (TARGET), JB Hi-Fi (JB HI FI, JB HI-FI), Amazon (AMAZON, AMZN): Shopping;
- Chemist Warehouse (CHEMIST WAREHOUSE, CHEMISTWAREHOUSE), Priceline (PRICELINE): Health;
- Opal (OPAL, TRANSPORTFORNSW), Uber (UBER TRIP, UBER *TRIP), Ampol (AMPOL), BP (BP ), 7-Eleven (7-ELEVEN, 7 ELEVEN), Shell (SHELL ), Linkt (LINKT): Transport;
- Uber Eats (UBER EATS, UBER *EATS), Menulog (MENULOG), DoorDash (DOORDASH), McDonald's (MCDONALDS): Dining out;
- AGL (AGL), Origin (ORIGIN ENERGY), EnergyAustralia (ENERGYAUSTRALIA), Telstra (TELSTRA), Optus (OPTUS), Aussie Broadband (AUSSIE BROADBAND), Sydney Water (SYDNEY WATER): Bills & utilities;
- Netflix (NETFLIX), Spotify (SPOTIFY), Disney Plus (DISNEY PLUS, DISNEYPLUS), Stan (STAN.COM), YouTube Premium (YOUTUBE PREMIUM, GOOGLE YOUTUBE), Apple (APPLE.COM/BILL): Subscriptions;
- Medibank (MEDIBANK), Bupa (BUPA), NRMA (NRMA INSURANCE): Insurance;
- ATO (ATO, AUSTRALIAN TAXATION): Government & tax.

Uber Eats must be checked before Uber, so the longest alias wins.

`mapPocketSmithCategory` lowercases the title and maps it:
- groceries, supermarket → Groceries
- restaurants, dining, eating out, takeaway, fast food → Dining out
- coffee, cafe → Coffee
- transport, fuel, petrol, public transport, parking, tolls, car → Transport
- shopping, clothing, electronics, general merchandise → Shopping
- utilities, bills, electricity, gas, water, internet, phone, mobile phone → Bills & utilities
- entertainment, movies, music, games → Entertainment
- subscriptions → Subscriptions
- health, medical, pharmacy, doctor → Health
- home, household, home improvement, furniture → Home
- insurance → Insurance
- personal care, hair, beauty, fitness, gym → Personal care
- education → Education
- travel, holidays, accommodation, flights → Travel
- gifts, donations, charity → Gifts & donations
- pets → Pets
- fees, bank fees, interest → Fees & interest
- cash, atm → Cash
- tax, government → Government & tax
- salary, income, wages, interest income, refunds → Income

Anything else → null.

`institutionGroup`:
- `/commonwealth|commbank|\bcba\b/i` → `CommBank`
- `/american express|amex/i` → `Amex`
- `/^up\b|up bank/i` → `Up`

- [ ] **Step 1: Write failing tests:**
  ```ts
  expect(cleanMerchant('WOOLWORTHS 1234 SYDNEY AU Card xx1234')).toBe('Woolworths');
  expect(cleanMerchant('SQ *CAFE ABC SURRY HILLS NSW')).toBe('Cafe Abc Surry');
  expect(cleanMerchant('UBER *EATS HELP.UBER.COM')).toBe('Uber Eats');
  expect(cleanMerchant('UBER *TRIP HELP.UBER.COM')).toBe('Uber');
  expect(merchantCategory('Woolworths')).toBe('Groceries');
  expect(merchantCategory('Cafe Abc Surry')).toBeNull();
  expect(mapPocketSmithCategory('Eating Out')).toBe('Dining out');
  expect(mapPocketSmithCategory(null)).toBeNull();
  expect(institutionGroup('Commonwealth Bank of Australia')).toBe('CommBank');
  expect(institutionGroup('American Express')).toBe('Amex');
  expect(institutionGroup('Up')).toBe('Up');
  expect(institutionGroup('ING')).toBe('ING');
  expect(SEED_CATEGORIES.filter(c => c.kind === 'income').map(c => c.name)).toEqual(['Income']);
  // every MERCHANTS / map target exists in SEED_CATEGORIES
  ```
- [ ] **Step 2:** Run `npm test -w @curly/core`. Expected: FAIL, because the module isn't found.
- [ ] **Step 3:** Implement the three files.
- [ ] **Step 4:** Run `npm test -w @curly/core`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(core): categories, merchant cleanup, PocketSmith category map`.

### Task 2: Categorisation pipeline (core)

**Files:** create `packages/core/src/spending/categorise.ts`. Tests go in `packages/core/test/spending/categorise.test.ts`.

**Interfaces:**
- Consumes (Task 1): `merchantCategory`, `mapPocketSmithCategory`.
- Produces:
```ts
type Flow = 'normal' | 'transfer' | 'mortgage' | 'not_spending';
type CategorySource = 'rule' | 'learned' | 'past' | 'merchant' | 'pocketsmith' | 'default' | 'user';
type Rule = { id: number; origin: 'user' | 'learned'; matchText: string; accountId: number | null;
              amountCents: number | null; categoryId: number | null; flow: Flow | null; createdAt: string };
type CategoriseInput = { accountId: number; amountCents: Cents; description: string; merchant: string;
                         psCategory: string | null; isCreditCard: boolean };
type CategoriseContext = { rules: Rule[]; pastByMerchant: Map<string, number>;   // merchant → categoryId of latest user-set row
                           categoryIdByName: Map<string, number> };
type CategoriseResult = { categoryId: number | null; source: Exclude<CategorySource, 'user'> | null; flow: Flow | null; ruleId: number | null };
ruleMatches(rule: Rule, t: CategoriseInput): boolean
categorise(t: CategoriseInput, ctx: CategoriseContext): CategoriseResult
```

`ruleMatches` returns true when all of these hold:
- the uppercased `matchText` is a substring of the uppercased `description` **or** of `merchant`;
- `accountId` is null or equal to the row's;
- `amountCents` is null or equal to the row's.

Rule order: `user` before `learned`, then newest `createdAt` first. A rule may carry only a `flow` (for example a "not spending" payee rule). In that case the returned `flow` is set and categorisation continues down the steps for the category. `source` reports the step that set the category.

- [ ] **Step 1: Write failing tests:**
  ```ts
  const ids = new Map([['Groceries', 1], ['Dining out', 2], ['Income', 21], ['Shopping', 5]]);
  const base = { accountId: 7, amountCents: -8420, description: 'WOOLWORTHS 1234', merchant: 'Woolworths', psCategory: null, isCreditCard: false };
  const ctx0 = { rules: [], pastByMerchant: new Map(), categoryIdByName: ids };
  // merchant list
  expect(categorise(base, { rules: [], pastByMerchant: new Map(), categoryIdByName: ids })).toEqual({ categoryId: 1, source: 'merchant', flow: null, ruleId: null });
  // user rule beats learned beats past beats merchant
  const learned = { id: 1, origin: 'learned', matchText: 'woolworths', accountId: null, amountCents: null, categoryId: 5, flow: null, createdAt: '2026-10-01' };
  const user = { ...learned, id: 2, origin: 'user', categoryId: 2 };
  expect(categorise(base, { rules: [learned, user], pastByMerchant: new Map([['Woolworths', 21]]), categoryIdByName: ids }).categoryId).toBe(2);
  expect(categorise(base, { rules: [learned], pastByMerchant: new Map([['Woolworths', 21]]), categoryIdByName: ids }).source).toBe('learned');
  expect(categorise(base, { rules: [], pastByMerchant: new Map([['Woolworths', 21]]), categoryIdByName: ids }).source).toBe('past');
  // pocketsmith fallback, then default income, then inbox
  const unknown = { ...base, description: 'XYZ PTY', merchant: 'Xyz Pty' };
  expect(categorise({ ...unknown, psCategory: 'Eating Out' }, ctx0).source).toBe('pocketsmith');
  expect(categorise({ ...unknown, amountCents: 470000 }, ctx0)).toMatchObject({ categoryId: 21, source: 'default' });
  expect(categorise({ ...unknown, amountCents: 4000, isCreditCard: true }, ctx0)).toMatchObject({ categoryId: null, source: null });
  expect(categorise(unknown, ctx0)).toMatchObject({ categoryId: null, source: null });
  // flow-only rule
  const ns = { ...user, id: 3, matchText: 'JOHN SMITH', categoryId: null, flow: 'not_spending' };
  expect(categorise({ ...unknown, description: 'TRANSFER TO JOHN SMITH' }, { ...ctx0, rules: [ns] })).toMatchObject({ flow: 'not_spending', ruleId: 3, categoryId: null });
  // account / amount conditions
  expect(ruleMatches({ ...user, accountId: 8 }, base)).toBe(false);
  expect(ruleMatches({ ...user, amountCents: -8420 }, base)).toBe(true);
  ```
- [ ] **Step 2:** Run `npm test -w @curly/core`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test -w @curly/core`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(core): categorisation pipeline`.

### Task 3: Flow detection and spending maths (core)

**Files:** create `packages/core/src/spending/{flows,summarise}.ts`. Tests go in `packages/core/test/spending/{flows,summarise}.test.ts`.

**Interfaces (Produces):**
```ts
type FlowTxn = { id: number; accountId: number; accountKind: AccountKind; date: string; amountCents: Cents;
                 description: string; flow: Flow; flowSource: 'auto' | 'user' | 'rule' };
detectFlows(txns: FlowTxn[]): Map<number, { flow: Flow; pairId: number | null }>
  // decisions for every flowSource==='auto' row in the input; rows not paired and not keyword-matched → 'normal'
type Period = { from: string; to: string };   // inclusive YYYY-MM-DD
monthPeriod(month: string): Period
statementPeriod(month: string): Period
type SpendLine = { txnId: number; accountId: number; institution: string; date: string; amountCents: Cents;
                   categoryId: number | null; categoryKind: 'spending' | 'income' | null; flow: Flow };
type Summary = { totalCents: Cents; moneyInCents: Cents; mortgageCents: Cents;
                 byCategory: { categoryId: number | null; cents: Cents; count: number }[];   // spending only, cents desc
                 byInstitution: { institution: string; cents: Cents }[];
                 notCounted: { flow: 'transfer' | 'mortgage' | 'not_spending'; cents: Cents; count: number }[];
                 uncategorisedCount: number };
summarise(lines: SpendLine[]): Summary
inOutByMonth(lines: SpendLine[], months: string[]): { month: string; inCents: Cents; mortgageCents: Cents; spendingCents: Cents }[]
runningByDay(lines: SpendLine[], month: string, today: string): { day: number; inCents: Cents; mortgageCents: Cents; spendingCents: Cents }[]
  // cumulative per day 1..last day of month, stopping at today when month is the current month
```

`notCounted` cents are absolute values of outflows (Σ −amount for amount < 0). `byInstitution` uses `institutionGroup`, sorted by cents descending, and omits institutions with 0 spending. Callers pass only lines that are already filtered to `counts_spending` accounts, or to the one account being viewed, and to the period. Splits arrive as separate lines sharing a `txnId`. `uncategorisedCount` counts distinct `txnId`s with a null category, `flow = 'normal'` and `amountCents < 0`.

- [ ] **Step 1: Write failing tests:**
  ```ts
  // Review Focus 5
  const t = (id, accountId, accountKind, date, amountCents, description = 'X') => ({ id, accountId, accountKind, date, amountCents, description, flow: 'normal', flowSource: 'auto' });
  const d = detectFlows([t(1,1,'transaction','2026-10-01',-50000), t(2,1,'transaction','2026-10-03',-50000),
                         t(3,2,'savings','2026-10-03',50000), t(4,2,'savings','2026-10-01',50000), t(5,1,'transaction','2026-10-20',-50000)]);
  expect(d.get(1)).toEqual({ flow: 'transfer', pairId: 4 });
  expect(d.get(2)).toEqual({ flow: 'transfer', pairId: 3 });
  expect(d.get(5)).toEqual({ flow: 'normal', pairId: null });
  // mortgage pairing and keyword fallbacks
  const m = detectFlows([t(1,1,'transaction','2026-10-28',-310000), t(2,3,'mortgage','2026-10-28',310000)]);
  expect(m.get(1)!.flow).toBe('mortgage'); expect(m.get(2)!.flow).toBe('transfer');
  expect(detectFlows([t(1,1,'transaction','2026-10-28',-310000,'HOME LOAN REPAYMENT')]).get(1)!.flow).toBe('mortgage');
  expect(detectFlows([t(1,4,'credit_card','2026-10-10',253000,'PAYMENT RECEIVED - THANK YOU')]).get(1)!.flow).toBe('transfer');
  expect(detectFlows([t(1,4,'credit_card','2026-10-10',4000,'KMART REFUND')]).get(1)!.flow).toBe('normal');
  // user rows are never in the output and never paired
  expect(detectFlows([{ ...t(1,1,'transaction','2026-10-01',-500), flowSource: 'user' }, t(2,2,'savings','2026-10-01',500)]).has(1)).toBe(false);
  // Review Focus 4
  expect(monthPeriod('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  expect(statementPeriod('2026-12')).toEqual({ from: '2026-11-26', to: '2026-12-25' });
  expect(statementPeriod('2027-01')).toEqual({ from: '2026-12-26', to: '2027-01-25' });
  // Review Focus 3 + definitions
  const L = (txnId, amountCents, categoryId, categoryKind, flow = 'normal', institution = 'American Express') => ({ txnId, accountId: 1, institution, date: '2026-10-05', amountCents, categoryId, categoryKind, flow });
  const s = summarise([L(1,-10000,5,'spending'), L(2,4000,5,'spending'), L(3,253000,null,null,'transfer'),
                       L(4,500000,21,'income','normal','Commonwealth Bank'), L(5,-310000,null,null,'mortgage','Commonwealth Bank'), L(6,-2000,null,null)]);
  expect(s.totalCents).toBe(8000);                  // 100 − 40 refund + 20 uncategorised
  expect(s.byCategory[0]).toEqual({ categoryId: 5, cents: 6000, count: 2 });
  expect(s.moneyInCents).toBe(500000);
  expect(s.mortgageCents).toBe(310000);
  expect(s.uncategorisedCount).toBe(1);
  expect(s.byInstitution).toEqual([{ institution: 'Amex', cents: 8000 }]);
  expect(s.notCounted.find(n => n.flow === 'mortgage')).toEqual({ flow: 'mortgage', cents: 310000, count: 1 });
  // splits: two lines, one txn
  expect(summarise([L(9,-6000,1,'spending'), L(9,-4000,5,'spending')]).byCategory).toHaveLength(2);
  expect(runningByDay([L(1,-1000,5,'spending')].map(l => ({ ...l, date: '2026-10-03' })), '2026-10', '2026-10-05')
    .map(r => r.spendingCents)).toEqual([0, 0, 1000, 1000, 1000]);
  ```
- [ ] **Step 2:** Run `npm test -w @curly/core`. Expected: FAIL.
- [ ] **Step 3:** Implement. `detectFlows` builds candidate pairs (outflow o, inflow i, `i.amount === -o.amount`, different account, |Δdays| ≤ 3). It sorts them by (|Δdays|, o.id, i.id), takes each greedily if both rows are unused, then applies the keyword fallbacks to the rows left over.
- [ ] **Step 4:** Run `npm test -w @curly/core`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(core): transfer detection and spending summaries`.

### Task 4: Schema, sync capture and pending reconciliation (API)

**Files:**
- create `apps/api/migrations/0002_spending.sql`;
- modify `packages/core/src/sync/pocketsmith.ts` and `apps/api/src/pocketsmith/{index,client}.ts`;
- modify `apps/api/src/sync/runSync.ts` and `apps/api/src/db/repo.ts`;
- tests go in `apps/api/test/{sync,repo}.test.ts`.

**Migration `0002_spending.sql`:**
- `category (id serial pk, name text not null unique, emoji text not null, color text not null, kind text not null check (kind in ('spending','income')), sort int not null)`, seeded from `SEED_CATEGORIES` with literal `insert … on conflict (name) do nothing`. The SQL file holds the values; a core test asserts the SQL names equal `SEED_CATEGORIES` names.
- `rule (id serial pk, origin text not null check (origin in ('user','learned')), match_text text not null, account_id int null references account(id) on delete cascade, amount_cents bigint null, category_id int null references category(id), flow text null check (flow in ('normal','transfer','mortgage','not_spending')), created_at timestamptz not null default now(), check (category_id is not null or flow is not null))`.
- `transaction_split (id bigserial pk, transaction_id bigint not null references transaction(id) on delete cascade, category_id int not null references category(id), amount_cents bigint not null)`.
- `alter table transaction add column`:
  - `merchant text not null default ''`
  - `ps_category text`
  - `category_id int references category(id)`
  - `category_source text`
  - `initial_source text`
  - `categorised boolean not null default false`
  - `flow text not null default 'normal' check (...)`
  - `flow_source text not null default 'auto' check (flow_source in ('auto','user','rule'))`
  - `pair_id bigint`
  - `note text`
- `create index transaction_date on transaction (date)`.

**Changes:**
- `PsTransaction` gains `category: { title: string } | null`.
- `TransactionRow` gains `psCategory: string | null` and `merchant: string`:
  - `mapTransaction` sets `merchant = cleanMerchant(t.payee || t.original_payee || '')`;
  - `psCategory = t.category?.title ?? null`.
- `upsertTransactions` writes `merchant` and `ps_category`, and updates them on conflict. It **never** touches the category or flow columns.
- `insertCsvRows` writes `merchant = cleanMerchant(description)`.
- `PocketSmithClient.transactions(accountId, opts: { updatedSince?: string; startDate?: string })` maps `startDate` to the `start_date` query parameter.
- `runSync`, for each account, after the incremental fetch:
  1. fetches again with `startDate` = Sydney today minus 14 days;
  2. upserts those rows;
  3. calls `repo.deleteMissingFeedRows(localId, startDate, keptExternalIds)`.

  It records the earliest date touched across both fetches as the pipeline's `since` (Task 5 consumes it).
- `Repo.deleteMissingFeedRows(accountId: number, from: string, keep: string[]): Promise<number>` deletes `source = 'pocketsmith'` rows with `date >= from` whose `external_id` is not in `keep`.
- `SyncResult` gains `since: string | null`.

- [ ] **Step 1: Write failing tests:**
  - **Review Focus 1.** Sync 1 returns pending ID 100 (−$20, 3 days ago). Sync 2's incremental fetch returns nothing new. Its window fetch returns posted ID 101 (−$20) and not 100. After sync 2, the account has exactly one row, external ID `101`, status `posted`.
  - A row dated 30 days ago and missing from the window fetch is **not** deleted.
  - A CSV row in the window is never deleted.
  - After upsert, `merchant` is `Woolworths` for payee `WOOLWORTHS 1234 SYDNEY`, and `ps_category` is stored.
  - Re-sync of a row whose `category_id` was set leaves `category_id` unchanged.
  - The fake client records `transactions:<id>:<updatedSince>:<startDate>` calls; extend `fakePocketSmith` accordingly.
- [ ] **Step 2:** Run `npm test -w @curly/api`. Expected: FAIL.
- [ ] **Step 3:** Implement the migration, mapping, client parameter, repo method and runSync changes.
- [ ] **Step 4:** Run `npm test -w @curly/api` and `npm test -w @curly/core`. Expected: PASS. Then `npx tsc --noEmit -p apps/api`. Expected: clean.
- [ ] **Step 5:** Commit: `feat(api): spending schema, merchant capture, pending reconciliation`.

### Task 5: Post-sync pipeline (API)

**Files:**
- create `apps/api/src/spending/pipeline.ts`;
- modify `apps/api/src/db/repo.ts`, `apps/api/src/sync/runSync.ts` and `apps/api/src/routes/imports.ts`;
- tests go in `apps/api/test/pipeline.test.ts`.

**Interfaces (Produces):**
```ts
runPipeline(repo: Repo, opts: { since: string | null }): Promise<{ categorised: number; flowsChanged: number }>
Repo additions:
  listCategories(): Promise<CategoryDto[]>            // { id, name, emoji, color, kind, sort }
  listRules(): Promise<Rule[]>
  pastByMerchant(): Promise<Map<string, number>>       // latest category_source='user' row per merchant
  uncategorisedForPipeline(): Promise<(CategoriseInput & { id: number })[]>   // rows where categorised = false
  applyCategorisation(rows: { id: number; categoryId: number | null; source: string | null; flow: Flow | null; ruleId: number | null }[]): Promise<void>
     // sets category_id, category_source, initial_source = coalesce(initial_source, source), categorised = true;
     // when flow is non-null and flow_source <> 'user' also sets flow, flow_source = 'rule'
  flowTxnsSince(from: string): Promise<FlowTxn[]>      // all accounts, date >= from
  applyFlows(decisions: Map<number, { flow: Flow; pairId: number | null }>): Promise<number>   // only flow_source='auto' rows; returns rows changed
```

What `runPipeline` does:
1. Categorise every row with `categorised = false`. Use `isCreditCard` = account kind `credit_card`.
2. Run `detectFlows` over `flowTxnsSince(since − 3 days)`. When `since` is null, use the earliest transaction date.
3. Apply only the decisions for rows dated ≥ `since`.

Who calls it:
- `runSync` calls `runPipeline` after a successful sync, using the `since` from Task 4.
- `/imports/commit` calls it after inserting, with `since` = the earliest imported date.

A pipeline failure marks the sync `failed`, with the error, and leaves the rows `categorised = false`, so the next run retries them.

- [ ] **Step 1: Write failing tests (PGlite, seed through a real sync with `fakePocketSmith`):**
  - A Woolworths row gets Groceries with `category_source = 'merchant'` and `initial_source = 'merchant'`.
  - A CommBank −$2,530 on 10 Oct plus an Amex +$2,530 "PAYMENT RECEIVED - THANK YOU" on 11 Oct are both `transfer` and share a `pair_id`.
  - A −$3,100 to the mortgage account becomes `mortgage`.
  - **Review Focus 2.** Set row X to `category_source='user'`, `category_id=Shopping`, `flow='not_spending'`, `flow_source='user'` directly in SQL. Then run another sync that returns X again, plus a matching opposite-amount row, then `runPipeline({ since: null })`. X is unchanged, and the new row stays `normal` because X is never paired.
  - A CSV import commit categorises its rows.
  - A pipeline error during sync gives `status: 'failed'`.
- [ ] **Step 2:** Run `npm test -w @curly/api`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test -w @curly/api`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): categorise and detect transfers after sync and import`.

### Task 6: Transactions, categories and rules routes (API)

**Files:**
- create `apps/api/src/routes/{transactions,categories,rules}.ts`;
- mount them in `app.ts`;
- extend `repo.ts`;
- tests go in `apps/api/test/{transactions,rules}.test.ts`.

**Routes** (all JSON, 400 `bad_*` on validation errors, 404 `*_not_found`):
- `GET /categories` → `{ categories: CategoryDto[] }`, ordered by `sort`.
- `POST /categories { name, emoji, color, kind }` → 201 `CategoryDto`. Returns 409 `category_exists` on a duplicate name. `sort` = max + 1.
- `GET /transactions?month=YYYY-MM[&period=statement][&accountId=N][&categoryId=N|none][&institution=CommBank]` → `{ transactions: TransactionDto[] }`, newest first. Uses Task 3's period helpers.
- `GET /transactions/:id` → `TransactionDto`.
- `PATCH /transactions/:id`. The body may contain:
  - `categoryId: number | null` → sets `category_source='user'`;
  - `flow` → sets `flow_source='user'`;
  - `note: string | null`.

  Returns `TransactionDto`.
- `PUT /transactions/:id/splits { splits: { categoryId, amountCents }[] }`:
  - parts must sum to the row's `amount_cents`, or it returns 400 `bad_split_total`;
  - parts must have the same sign as the row;
  - there must be ≥ 2 parts, or 0 parts to clear the split.

  Replaces all of the row's splits. Returns `TransactionDto`.
- `GET /rules` → `{ rules: (Rule & { matches: number })[] }`.
- `GET /rules/preview?matchText=…[&accountId][&amountCents][&categoryId]` → `{ matches: number }`. Counts rows the rule would match whose `category_source <> 'user'` and whose `category_id` differs from `categoryId`.
- `POST /rules { origin, matchText, accountId?, amountCents?, categoryId?, flow?, applyToPast: boolean }` → 201 `{ rule, updated }`. When `applyToPast` is true, it updates matching rows whose `category_source <> 'user'`:
  - `category_source='rule'` (`'learned'` for learned rules);
  - and the flow, where `flow_source <> 'user'`.

  `matchText` is trimmed and must be 3–60 characters, or it returns 400 `bad_match_text`.
- `DELETE /rules/:id` → 204. Already-categorised rows are untouched.
- The existing `GET /accounts/:id/transactions` now returns `TransactionDto` too, delegating to the same repo method.

`TransactionDto`:
```ts
{ id, accountId, date, amountCents, description, merchant, status, source,
  categoryId: number | null, categorySource: CategorySource | null,
  flow: Flow, flowSource: 'auto' | 'user' | 'rule', note: string | null,
  splits: { categoryId: number; amountCents: number }[] }
```

- [ ] **Step 1: Write failing tests:**
  - PATCH a category, then re-sync the same row: the category is kept.
  - PATCH a flow to `not_spending`, then run `runPipeline({ since: null })`: the flow is kept.
  - A split with a bad total → 400 `bad_split_total`. A good split → its 2 parts are returned. `PUT` with `[]` clears it.
  - Rule preview counts exclude user-set rows.
  - `POST` with `applyToPast: false` updates 0 rows. With `true` it updates N rows and never touches the user-set row.
  - `/transactions?categoryId=none&month=…` returns only uncategorised rows.
  - `period=statement` with `accountId` uses 26th–25th.
  - Every new route returns 401 without a token.
- [ ] **Step 2:** Run `npm test -w @curly/api`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test -w @curly/api`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): transaction edits, splits, categories and rules`.

### Task 7: Spending, in/out, inbox and stats routes (API)

**Files:**
- create `apps/api/src/routes/spending.ts`;
- extend `repo.ts` with `spendLines(period, filter)`;
- tests go in `apps/api/test/spending.test.ts`.

**What `repo.spendLines` returns:** `SpendLine[]` for a period, with these filters:
- **Account filter:** with `accountId`, that account regardless of `counts_spending`; otherwise all `counts_spending` accounts.
- **Institution filter:** optional, using `institutionGroup`.
- **Splits:** a row with splits yields one line per split, with the split's category and kind; otherwise one line.

**Routes:**
- `GET /spending?month=YYYY-MM[&period=statement][&accountId][&institution]` → `Summary & { from, to, prevTotalCents }`. `prevTotalCents` is the same query for the previous month (or the previous statement period).
- `GET /spending/inout?end=YYYY-MM&months=6` → `{ months: { month, inCents, mortgageCents, spendingCents }[] }`, oldest first. `months` is 1–12.
- `GET /spending/daily?month=YYYY-MM` → `{ days: … }` from `runningByDay`, with today taken from `deps.now()` in Sydney.
- `GET /inbox` → `{ items: (TransactionDto & { guesses: number[] })[], total }`. Covers uncategorised rows with `flow='normal'` and `amount_cents < 0` on `counts_spending` accounts, newest first, limited to 50. `guesses` holds up to 3 distinct category IDs, in this order:
  1. the latest user-set category for the merchant;
  2. `merchantCategory`;
  3. `mapPocketSmithCategory(ps_category)`;
  4. the categories most used in the last 90 days, by count.
- `GET /stats/categorisation` → `{ autoPercent: number | null, sample: number }`. It covers rows created in the last 30 days with `categorised = true`. `autoPercent` = round(100 × count(initial_source not null) ÷ count). It is null when the count is 0.

- [ ] **Step 1: Write failing tests:**
  - Seed the definitions example from Task 3 through real inserts. `/spending` returns `totalCents: 8000` and the matching breakdowns.
  - `/spending?institution=Amex` excludes CommBank rows.
  - A split row contributes to two categories.
  - A `counts_spending=false` account is excluded unless `accountId` is passed.
  - `prevTotalCents` uses the previous month.
  - `/spending/inout` for 6 months returns 6 entries, including zero months.
  - `/inbox` puts the merchant-list guess first when there's no user history.
  - `/stats/categorisation` gives 75 when 3 of 4 rows were auto-categorised.
- [ ] **Step 2:** Run `npm test -w @curly/api`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test -w @curly/api`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): spending summaries, in/out, inbox and auto-sort stats`.

### Task 8: Mobile data layer, transaction rows, picker sheet

**Files:**
- modify `apps/mobile/src/api/{types,hooks}.ts` and `src/components/TransactionRow.tsx`;
- create `src/lib/days.ts` (move `dayHeader`, `plainDay`, `sydneyDate` and `dayBefore` here from `app/account/[id].tsx`, which then imports them; this clears a Plan 2 deferred minor);
- create `src/theme/categoryColor.ts` and `src/components/{Sheet,CategoryPicker,TransactionList}.tsx`;
- tests go in `__tests__/{transaction-row,category-picker}.test.tsx`.

**Hooks (Produces):**
- `useCategories()`
- `useCreateCategory()`
- `useTransactionsQuery(q: { month; period?; accountId?; categoryId?: number | 'none'; institution? })` with query key `['transactions', q]`
- `useTransaction(id)`
- `useUpdateTransaction()`, with optimistic update and rollback like `useUpdateAccount`
- `useSetSplits()`
- `useRules()`
- `useRulePreview(params, enabled)`
- `useCreateRule()`
- `useDeleteRule()`
- `useSpending(q)`
- `useInOut(end, months)`
- `useDaily(month)`
- `useInbox()`
- `useCategorisationStats()`

Every mutation invalidates `transactions`, `spending`, `inbox` and `inout`.

**Types:** `Transaction` becomes the full `TransactionDto` from Task 6. Add `Category`, `Rule`, `SpendingSummary`, `InOutMonth`, `DailyPoint` and `InboxItem`.

**Components:**
- **`categoryColor(color: CategoryColor, t: ThemeTokens): string`**: `line` → `t.line`; otherwise `accents[color]`.
- **`TransactionRow({ txn, category, onPress })`**, per visual spec §5:
  - an `IconTile` with the category emoji and colour, showing `merchant` (fallback `description`);
  - subline cases:
    - category name;
    - uncategorised: `?` tile on `line`, with yellow subline `Uncategorised · tap to sort`;
    - `flow='transfer'`: `↔` tile at 60% opacity, subline `Transfer · not spending`;
    - `flow='mortgage'`: subline `Mortgage · not spending`;
    - `flow='not_spending'`: subline `<category or "No category"> · not spending`;
  - a `Pending` subline suffix is kept: ` · Pending`;
  - split rows show the subline `Split · N categories`;
  - income amounts are lime with `+`, as now.
- **`TransactionList({ transactions, categories, today, onPressTxn })`**: day-grouped cards with `dayHeader`, used by account detail and the drill-down.
- **`Sheet({ visible, onClose, children })`**: a transparent `Modal`, a dimmed backdrop that closes it on press, a `surface` panel with top radius 26, and a grab handle.
- **`CategoryPicker({ visible, onClose, onPick, categories })`**:
  - a search input that filters by name, case-insensitive;
  - a 4-column emoji grid with names;
  - a final tile `+ New category` that opens an inline name and emoji form and calls `useCreateCategory`. The new category gets colour `line` and kind `spending`.

- [ ] **Step 1: Write failing tests:**
  - Each subline case above renders its exact text.
  - Hide balances masks the amount.
  - The picker filters "gro" down to Groceries.
  - Picking calls `onPick(id)`.
  - Creating a category calls the mutation with `{ name, emoji, color: 'line', kind: 'spending' }`.
  - The existing `account-detail.test.tsx` still passes after the move. Update its fixtures to the new `Transaction` shape.
- [ ] **Step 2:** Run `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i transaction-row category-picker account-detail`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then `npx tsc --noEmit`. Expected: clean.
- [ ] **Step 5:** Commit: `feat(mobile): categorised transaction rows and category picker`.

### Task 9: Transaction detail screen

**Files:**
- create `apps/mobile/app/transaction/[id].tsx`;
- register it in `app/_layout.tsx` inside the protected group;
- account-detail rows navigate to `/transaction/<id>`;
- test goes in `__tests__/transaction-detail.test.tsx`.

**Layout (visual spec screen 2):**
- back button;
- a large `IconTile`;
- `merchant` as the title;
- the raw `description`, muted;
- an `<Amount variant="hero">`;
- a primary button showing `Choose category` when uncategorised, or `<emoji> <name>` when categorised;
- a details card with Date, Account and Status;
- a **Counts as** `Segmented` control with the options `Spending · Transfer · Mortgage · Not spending`, mapping to flows `normal · transfer · mortgage · not_spending`;
- a `Split` row;
- a `Note` input that saves on blur.

**Behaviour:**
- Picking a category calls `useUpdateTransaction({ categoryId })`. It then opens the **remember sheet**, which has two `Toggle`s, both on by default:
  - `Always put <merchant> in <category>`;
  - `Also update <N> earlier <merchant> transactions`, where N comes from `useRulePreview({ matchText: merchant, categoryId })`. This toggle is hidden when N is 0.

  The sheet has a `Done` button. If the first toggle is on, it calls `useCreateRule({ origin: 'learned', matchText: merchant, categoryId, applyToPast: secondToggle })`. A Caveat `HandNote` reads `nice, one less to sort`.
- Choosing `Not spending` opens a smaller sheet with one toggle, `Always treat <merchant> as not spending`, which creates a learned rule with `flow: 'not_spending'`.
- **Split editor** (inline, in a `Sheet`):
  - rows of a category button plus an amount input in dollars, which converts with `parseDecimalToCents`;
  - `+ Add part`;
  - a remaining-amount line `$X left to assign`;
  - `Save`, enabled only when the remainder is $0.00 and there are ≥ 2 parts. Save calls `useSetSplits`;
  - `Remove split` calls it with `[]`.

- [ ] **Step 1: Write failing tests (hooks mocked as in `account-detail.test.tsx`):**
  - Picking Groceries calls update with `{ id, categoryId: 1 }`, then shows both toggles, with `Also update 3 earlier Woolworths transactions` when the preview returns 3.
  - `Done` with defaults calls `createRule` with `applyToPast: true`.
  - Turning off the first toggle creates no rule.
  - Pressing `Mortgage` calls update with `{ flow: 'mortgage' }`.
  - The split `Save` is disabled at "$10.00 left to assign" and enabled at $0.00, then calls `setSplits` with cents.
- [ ] **Step 2:** Run `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i transaction-detail`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npx tsc --noEmit`.
- [ ] **Step 5:** Commit: `feat(mobile): transaction detail with recategorise, remember, counts-as and split`.

### Task 10: Spending tab and category drill-down

**Files:**
- modify `apps/mobile/app/(tabs)/spending.tsx`;
- create `app/category/[id].tsx` (`id` is a number or `none`) and `src/components/CategoryBar.tsx`;
- tests go in `__tests__/{spending-tab,category-drilldown}.test.tsx`.

**Spending tab (visual spec screen S, product spec §9.3):**
- a `MonthSwitcher`;
- chips `All · CommBank · Amex · Up`, which set `institution` (`All` means none);
- the total as `<Amount variant="hero">` with an orange `CrayonUnderline`, plus a `HandNote`:
  - `$X more than <Mon>` (pink) when the total is higher than `prevTotalCents`;
  - `$X less than <Mon>` (lime) when lower;
  - no note when they're equal or the previous month is 0;
- a muted per-institution split line, `CommBank $X · Amex $Y · Up $Z`, using inline `Amount`;
- when `uncategorisedCount > 0`, a dashed-outline box `<N> transactions to sort · Sort ›` that navigates to `/inbox` (singular when N is 1: `1 transaction to sort`);
- `CategoryBar`s for `byCategory`. Bar width = cents ÷ the largest category's cents. The uncategorised entry shows `?` and `Uncategorised`. Tapping a bar opens `/category/<id|none>?month=…&institution=…`;
- a `Not counted as spending` card listing `Transfers`, `Mortgage repayments` and `Not spending`, each with its count and amount. Entries with a count of 0 are hidden;
- pull-to-refresh, using the same sync flow as Accounts.

**Drill-down:**
- a header with the category emoji and name, the month and the total;
- a `TransactionList` from `useTransactionsQuery({ month, categoryId, institution })`, where rows open the transaction detail.

**`CategoryBar({ emoji, color, name, cents, fraction, onPress })`:** follows visual spec §5. Leave the limit marker out; that's Plan 4.

- [ ] **Step 1: Write failing tests:**
  - The total and the `$310 more than Sep` note render when the previous total is $310 lower.
  - Pressing the `Amex` chip calls `useSpending` with `institution: 'Amex'`.
  - The sort box text reads `3 transactions to sort · Sort ›` and navigates to `/inbox`.
  - A zero-count not-counted entry is hidden.
  - Tapping Groceries pushes `/category/1?month=2026-10`.
  - The drill-down lists only the rows the hook returns, grouped by day.
- [ ] **Step 2:** Run `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i spending-tab category-drilldown`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npx tsc --noEmit`.
- [ ] **Step 5:** Commit: `feat(mobile): spending tab and category drill-down`.

### Task 11: Uncategorised inbox

**Files:**
- create `apps/mobile/app/inbox.tsx` and register it;
- test goes in `__tests__/inbox.test.tsx`.

**Layout (visual spec screen 3):**
- a header `Sort <total>` with a progress bar of sorted-this-session ÷ the starting total;
- the top card shows:
  - the merchant;
  - the description;
  - the amount;
  - the date;
  - the account;
  - guess pills (category emoji and name), with the first pill in lime and the rest on `surface`;
- a `More categories` button that opens `CategoryPicker`;
- two plain buttons under the card, `Skip` and `Use <top guess>`, as accessible alternatives to swiping.

**Swipes:** the card follows a `PanResponder` drag and snaps back unless dx passes ±120.
- Right: accept the top guess, i.e. `useUpdateTransaction({ categoryId: guesses[0] })`.
- Left: skip, moving the card to the end of the local queue.
- Tapping any pill accepts that category.

Accepting does **not** open the remember sheet. The inbox is for speed; rules are created from the transaction detail screen.

**Empty state:** a crayon illustration (reuse `SunDoodle`), `All sorted!` in title style, and `<autoPercent>% sorted automatically this month` from `useCategorisationStats` (hidden when null).

Respect reduced motion: when it's on, skip the snap animation.

- [ ] **Step 1: Write failing tests:**
  - Pressing `Use Groceries` calls update with the first guess and advances to the next card.
  - `Skip` moves the card to the end.
  - Tapping the second pill uses that category.
  - An empty inbox shows `All sorted!` and `92% sorted automatically this month`.
  - Swipe gestures are verified on the phone (Task 14), not in Jest.
- [ ] **Step 2:** Run `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i inbox`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npx tsc --noEmit`.
- [ ] **Step 5:** Commit: `feat(mobile): uncategorised inbox`.

### Task 12: Account detail pager, totals and Amex statement toggle

**Files:**
- modify `apps/mobile/app/account/[id].tsx`;
- update `__tests__/account-detail.test.tsx`.

**Header (visual spec screen 1):**
- everything that's there today;
- for Amex accounts only (`institutionGroup(account.institution) === 'Amex'`), a `Segmented` with `Calendar month · Statement`. `Statement` passes `period: 'statement'` and shows the period under the switcher, e.g. `26 Sep – 25 Oct`;
- the month's spent total, from `useSpending({ month, accountId, period })`, as `<Amount>` with a `CrayonUnderline`;
- the more/less `HandNote`, with the same rules as Task 10.

**Pages:** a horizontal `ScrollView` with `pagingEnabled` holding two pages:
- **Transactions** (default): a `TransactionList` from `useTransactionsQuery({ month, accountId, period })`. Rows open the transaction detail.
- **Categories**: the `CategoryBar`s for this account's `byCategory`.

The tab labels `Transactions` and `Categories` sit above the pages. The active one has a lime `CrayonUnderline`, and page dots sit below. Tapping a label scrolls to its page.

The empty and error texts stay as they are now.

- [ ] **Step 1: Write failing tests:**
  - A non-Amex account shows no `Statement` option.
  - An Amex account shows it, and pressing it calls the hooks with `period: 'statement'` and shows `26 Sep – 25 Oct` for October 2026.
  - Pressing `Categories` shows the category bars.
  - The month total renders.
  - The existing grouping, sync label and error tests still pass.
- [ ] **Step 2:** Run `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i account-detail`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npx tsc --noEmit`.
- [ ] **Step 5:** Commit: `feat(mobile): account categories page, month total and Amex statement view`.

### Task 13: Home hero card and money in/out chart

**Files:**
- create `apps/mobile/src/components/InOutChart.tsx`;
- modify `app/(tabs)/index.tsx`;
- tests go in `__tests__/{inout-chart,accounts-tab}.test.tsx`.

**Hero card** (above the account list, below the sync banner, visual spec screen H):
- a `SunDoodle` at the top right of the screen;
- a `HeroCard` containing:
  - `You've spent this month` (ink-on-accent label);
  - the spending total for this month as hero `<Amount>`, with a `CrayonUnderline` in `ink-on-accent`;
  - the chart.

  The warning chip is left out until Plan 4.
- The chart mode comes from `useSettings().homeChart`:
  - `sixMonths`: `useInOut(currentMonth, 6)`;
  - `thisMonth`: `useDaily(currentMonth)`.

**`InOutChart({ mode, data, onHero })`**, drawn with `react-native-svg` per visual spec §6:
- **Y axis:** 4 gridlines from 0 to a "nice" max, labelled with `formatAudShort`, or `$•••` when `hideBalances` is on. Gridlines are faint and dashed.
- **X axis:** month labels (`May`, `Jun`, …) in six-month mode; day numbers `1`, `8`, `15`, `22` and the last day in this-month mode.
- **Six-month mode:** each month has two bars, `in`, and `out` stacked as mortgage below spending. The current month is at 60% opacity.
- **This-month mode:** three cumulative lines (in, mortgage, spending).
- **Hero colours:** in `#16131f`, mortgage `accents.blue`, spending `accents.cream`.
- **Legend:** `In · Mortgage · Spending`.
- **Tap:** tapping a month (six-month mode) shows a figures row under the chart: `<Month>: in $X · mortgage $Y · spending $Z`.
- The chart's accessibility label summarises the latest month.

- [ ] **Step 1: Write failing tests:**
  - Six months of data render 6 x labels, ending with the current month.
  - Y labels use `$1.2k`-style values.
  - With `hideBalances` on, every y label is `$•••`.
  - Tapping the `Sep` bar group shows `September: in $5,200 · mortgage $3,100 · spending $2,480`.
  - `thisMonth` mode renders day labels including `1` and the last day.
  - The Accounts tab shows `You've spent this month` and the total from `useSpending`.
- [ ] **Step 2:** Run `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i inout-chart accounts-tab`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npx tsc --noEmit`.
- [ ] **Step 5:** Commit: `feat(mobile): home hero card with money in/out chart`.

### Task 14: Rules screen, full verification, owner check

**Files:**
- create `apps/mobile/app/rules.tsx`, linked from Settings as a row `Rules · <autoPercent>% auto-sorted`;
- tests go in `__tests__/rules.test.tsx`.

**Rules screen:** lists the rules, newest first. Each row shows:
- `match_text`;
- an arrow and the category emoji and name, or `Not spending`;
- the origin as a muted `you made this` or `learned`;
- the match count;
- a delete button that confirms with `Delete this rule? Past transactions keep their category.` and offers `Delete` and `Cancel`.

- [ ] **Step 1:** Write failing tests: the rule rows render, and delete calls the mutation after confirming.
- [ ] **Step 2:** Run the rules test. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the rules test. Expected: PASS.
- [ ] **Step 5:** Run the full verification:
  - `npm test -w @curly/core`;
  - `npm test -w @curly/api`;
  - `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i`;
  - `npx tsc --noEmit` in `apps/mobile` and `apps/api`.

  Expected: all pass.
- [ ] **Step 6:** Commit: `feat(mobile): rules screen`.
- [ ] **Step 7: The owner deploys and checks.**
  1. Run `cd apps/api`.
  2. Run the migration with the `Read-Host` steps from the README.
  3. Run `npx wrangler deploy`.
  4. Rebuild the APK.

  Then on the phone, check each of these and record the results in the ledger:
  - October's total on the Spending tab is plausible next to the bank apps;
  - the Amex statement view matches the last statement total;
  - salary shows as money in, and the mortgage repayment as blue;
  - Main → Amex payments sit under `Not counted as spending`;
  - swiping in the inbox works;
  - a recategorised merchant sticks after pull-to-refresh;
  - the auto-sort % shows.

### Task 15: Open the bank's own app (owner request 2026-10-23)

The app never moves money (spec §5). The owner asked for a one-tap way to jump to each synced bank's own app to make a transfer.

**Files:**
- create `apps/mobile/src/lib/bankApps.ts`, `src/components/OpenBankApp.tsx` and `plugins/withBankAppQueries.js`;
- modify `app.json` (add the plugin) and `package.json` (add `expo-intent-launcher`);
- use the component in `app/account/[id].tsx` and on the institution headers in `app/(tabs)/index.tsx`;
- test goes in `__tests__/open-bank-app.test.tsx`.

**Values:**
```ts
BANK_APPS: Record<string, { label: string; androidPackage: string }> = {
  CommBank: { label: 'CommBank', androidPackage: 'com.commbank.netbank' },
  Amex:     { label: 'Amex',     androidPackage: 'com.americanexpress.android.acctsvcs.au' },
  Up:       { label: 'Up',       androidPackage: 'au.com.up.money' },
};
bankAppFor(institution: string): { label; androidPackage } | null   // via institutionGroup
openBankApp(app): Promise<void>
```

**`openBankApp` behaviour:**
1. Try `IntentLauncher.openApplication(androidPackage)`.
2. If that throws, because the app isn't installed, call `Linking.openURL('market://details?id=<pkg>')`.
3. If that throws too, call `Linking.openURL('https://play.google.com/store/apps/details?id=<pkg>')`.

**Package visibility:** Android 11+ needs it to launch another app. `withBankAppQueries.js` is a config plugin. It uses `withAndroidManifest` to add `<queries><package android:name="…"/></queries>`, with one entry for each `BANK_APPS` package.

**UI:**
- **Account detail:** a secondary `Button` labelled `Open <label> app ↗` under the balance. It's shown only when `bankAppFor` finds a match.
- **Accounts tab:** each institution header with a match gets a small `↗` press target, with accessibility label `Open <label> app`.

No money logic is involved: these only launch the other app.

- [ ] **Step 1: Write failing tests:**
  - `bankAppFor('Commonwealth Bank of Australia')` gives `com.commbank.netbank`.
  - `bankAppFor('ING')` gives null, and no button is rendered.
  - Pressing `Open CommBank app ↗` calls `openApplication('com.commbank.netbank')`.
  - When `openApplication` rejects, `Linking.openURL` is called with the `market://` URL.
  - A plugin unit test: running it on a minimal manifest object adds 3 `<package>` queries.
- [ ] **Step 2:** Run `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i open-bank-app`. Expected: FAIL.
- [ ] **Step 3:** Run `npx expo install expo-intent-launcher`, then implement.
- [ ] **Step 4:** Run the same command. Expected: PASS. Run `npx tsc --noEmit`. Run `npx expo config --type introspect`; expected: the merged manifest shows the 3 queries.
- [ ] **Step 5:** Commit: `feat(mobile): open the bank's own app`.
- [ ] **Owner check (with Task 14):** on the phone, each button opens the right app.

`expo-intent-launcher` is a new native module, so the Task 14 APK rebuild covers it.

---

## Not in this plan

These belong to Plan 4 and later plans:
- limits and warnings (the hero card warning chip, limit markers);
- the calendar;
- notifications;
- net worth and its Home row;
- CommSec;
- projections;
- renaming, recolouring and deleting categories;
- editing rules (delete and recreate covers it for now).
