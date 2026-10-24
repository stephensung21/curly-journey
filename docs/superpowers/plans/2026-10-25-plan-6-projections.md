# Plan 6: Projections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Projections tab answers three questions:
- **ETFs:** what will my ETFs be worth at age N, and when do I hit my target?
- **Mortgage:** when am I mortgage-free, and how much do my offsets save me?
- **Both:** when do my ETFs overtake the loan, and is spare cash better in the offset or in ETFs?

Each mode has live sliders, and the inputs are pre-filled from real balances.

**Architecture:**
- **All maths is pure and lives in `packages/core/src/projections/`**, with heavy unit tests:
  - ETF compounding;
  - mortgage amortisation on loan − Σ offsets;
  - crossover;
  - offset-vs-invest.
- **The API stores one `projection_profile` row:**
  - About you: birth date, marginal tax rate;
  - the manual mortgage terms;
  - saved assumptions.

  `GET /projections` returns that profile plus pre-fill figures from real data.
- **The mobile Projections tab** is "layout A": one chart per mode with everything on it, a segmented ETFs · Mortgage · Both control, sliders, and the disclaimer. All maths runs on the phone from core, so sliders update instantly with no network calls.

**Tech Stack:** Everything from Plans 1–5. No new dependencies: the slider is a small `PanResponder` component, and charts are `react-native-svg` like `InOutChart` and `NetWorthChart`.

**Spec:** `docs/superpowers/specs/2026-10-22-curly-journey-v1-design.md`:
- §5, "general information, not advice";
- §6 rows "Projections layout", "Projections modes", "Mortgage inputs", "Mortgage structure";
- §7 row "Projection defaults": 7% return, 2.5% inflation, monthly compounding, today's-dollars option;
- §8 row "Mortgage terms";
- §9.8 per-account toggles;
- §9.9, the last bullet (average monthly investment);
- §9.10;
- §11 step 6.

`docs/superpowers/specs/2026-10-22-curly-journey-v1-visual-design.md`:
- §3 (crayon target line, circle, handwritten labels);
- §6 (axes; series colours: ETF growth/contributions lime area / `line` area; loan with offsets blue solid; without offsets muted dashed);
- §7 rows P and 6.

Mockups: `docs/design/mockups/00-style-home-spending-projections.html` (right panel, ETFs) and `docs/design/mockups/06-projections-mortgage-both.html`. Executors read both specs.

## Global Constraints

- **Everything from Plans 1–5 still applies:**
  - integer cents;
  - `Australia/Sydney` dates;
  - `<Amount>` for every dollar figure, and hide balances masks chart axis labels too;
  - auth on every route;
  - the 50-request Workers Free limit;
  - mobile Jest only as `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i --forceExit <pattern>`;
  - every new mobile route is registered inside `Stack.Protected` in `app/_layout.tsx`.
- **Rates are integer basis points** (`700` = 7.00%). The monthly rate is `annualBps / 10,000 / 12` (nominal, compounded monthly) for both ETFs and the mortgage.
- **Cents stay integers.** Each month's interest or growth is computed as a float and then `Math.round`ed to cents before it is added.
- **Horizon:** at most **600 months** (50 years). A loan not paid off within 600 months has `payoffMonth: null` and is shown as "Not paid off at this repayment".
- **Repayment frequency** turns into a monthly equivalent: weekly × 52 / 12, fortnightly × 26 / 12, rounded to cents.
- **Offsets:** interest each month = `round(max(0, loan − offset) × monthlyRate)`. "Offset balance" and "grows by" are the combined figure across every `is_offset` account (spec §9.10).
- **Today's dollars:** a value `v` at month `m` displays as `round(v / (1 + inflationBps/10,000)^(m/12))`.
- **Tax drag:** `effectiveReturnBps = returnBps − round(distributionYieldBps × taxRateBps / 10,000)`. It is used only by offset-vs-invest; ETFs mode uses the plain return. Tax rate unknown → 0.
- **Age:** from `birthDate` and today in Sydney, in whole months. No birth date → age markers hidden, headlines say "in N years", and an "Add your birth date" link goes to About you.
- **Persisted vs session-only:**
  - Saved in `projection_profile`:
    - birth date and tax rate;
    - mortgage rate, repayment, frequency and term;
    - offset growth;
    - ETF return, inflation, target amount, target age;
    - distribution yield;
    - the today's-dollars toggle.
  - Session-only, reset when the tab is left: ETF starting value and monthly contribution overrides, extra repayment, rate change, and the spare-cash slider.
- **Disclaimer (exact copy),** shown at the bottom of every mode: `General information only, not financial advice. These projections use simple assumptions and real results will differ.`
- **Defaults:**
  - return `700`, inflation `250`, distribution yield `300`;
  - target `100000000` cents ($1M), target age `60`;
  - repayment frequency `monthly`, extra `0`, rate change `0`, spare cash `50000` cents ($500/month).

## Review Focus

1. **A repayment that never covers the interest** (a high rate, a low repayment). Expected: no infinite loop and no negative or NaN values. The loan reaches 600 months unpaid, and the screen says so instead of a date. Test in Task 2.
2. **Offsets bigger than the loan.** Expected: interest floors at 0 and the loan is paid off by repayments alone. "Interest saved" never goes negative. Test in Task 2.
3. **Missing data:** no CommSec account, no mortgage account, no birth date, no saved mortgage terms. Expected: each mode still renders. The Mortgage and Both modes show a "Set up your home loan" card that opens the loan form (Task 4) instead of a broken chart. ETFs mode works from a $0 start. Tests in Tasks 5–7.
4. **Hide balances.** Expected: every dollar figure, axis label and slider value label is masked. Tests in Tasks 5–7.
5. **Slider edge values** (0 contribution, 0% return, a target already met today). Expected: the target year reads "already there", and nothing divides by zero. Tests in Tasks 1 and 5.

---

### Task 1: Core — ETF projection

**Files:**
- Create: `packages/core/src/projections/etf.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/src/holdings/commsec.ts` (reject a trade with `totalCents <= 0`, the Plan 5 parked minor, because Plan 6 relies on `avgMonthlyInvestmentCents`)
- Test: `packages/core/test/projections-etf.test.ts`, `packages/core/test/commsec.test.ts` (one case)

**Interfaces:**
- Produces:
  - `type EtfInput = { startCents: number; monthlyCents: number; returnBps: number; months: number }`
  - `type EtfPoint = { month: number; contributionsCents: number; valueCents: number }`. Month 0 is today. `contributionsCents` = start + monthly × month. Growth = value − contributions.
  - `projectEtf(i: EtfInput): EtfPoint[]`. Length is `months + 1`. Each month: `value = value + round(value × r) + monthlyCents`.
  - `targetMonth(points: EtfPoint[], targetCents: number): number | null`. The first month with `valueCents ≥ targetCents`; 0 when already there; null when never reached.
  - `todaysDollars(cents: number, month: number, inflationBps: number): number`
  - `ageMonths(birthDate: string, today: string): number`; `monthsUntilAge(birthDate: string, today: string, age: number): number`, floored at 0.
  - `addMonthsLabel(today: string, month: number): string` returns `YYYY`. `yearOf(today, month)` gives the calendar year of the month.
- Consumes: `shiftMonths` and `daysBetween` from `dates.ts`.

- [ ] **Step 1: Write failing tests:**
  - $10,000 start, $0 monthly, 700 bps, 12 months → value within 1 cent of `10000 × (1 + 0.07/12)^12` ($10,722.90).
  - $0 start, $500 monthly, 0 bps, 24 months → value $12,000 and contributions $12,000.
  - `targetMonth` cases: already met → 0; reached → the exact month; never → null.
  - `todaysDollars` at 120 months and 250 bps.
  - `ageMonths('1990-05-10', '2026-10-25')` = 437, and the birthday boundary.
  - `months: 0` → a single point.
  - commsec: a sell with Credit `-5.00` is skipped.
- [ ] **Step 2: Run** `cd packages/core && npx vitest run test/projections-etf.test.ts test/commsec.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cd packages/core && npx vitest run && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat(core): ETF projection maths`.

### Task 2: Core — mortgage, crossover and offset-vs-invest

**Files:**
- Create: `packages/core/src/projections/mortgage.ts`, `packages/core/src/projections/both.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/projections-mortgage.test.ts`, `packages/core/test/projections-both.test.ts`

**Interfaces:**
- Produces:
  - `type Frequency = 'weekly' | 'fortnightly' | 'monthly'`
  - `monthlyRepayment(cents: number, f: Frequency): number`
  - `requiredRepayment(balanceCents: number, rateBps: number, termMonths: number): number`. The standard annuity payment, rounded up to the cent. Rate 0 → `ceil(balance / term)`.
  - `type MortgageInput = { balanceCents: number; rateBps: number; monthlyRepaymentCents: number; offsetCents: number; offsetGrowthCents: number; extraMonthlyCents: number; rateChangeBps: number }`. The rate used is `max(0, rateBps + rateChangeBps)`, applied from month 1.
  - `type MortgagePoint = { month: number; balanceCents: number; offsetCents: number }`
  - `amortise(i: MortgageInput): { points: MortgagePoint[]; payoffMonth: number | null; interestCents: number }`.
    - Each month: `interest = round(max(0, balance − offset) × r)`, then `balance = max(0, balance + interest − repayment − extra)`, then `offset += offsetGrowthCents`.
    - It stops when the balance reaches 0, or at 600 months.
    - Points include month 0.
  - `compareOffset(i: MortgageInput): { withOffset: ReturnType<typeof amortise>; withoutOffset: ReturnType<typeof amortise>; interestSavedCents: number }`.
    - `withoutOffset` uses offset 0 and growth 0.
    - Saved = `max(0, without.interest − with.interest)` when both are paid off. Otherwise it is computed over the 600-month window.
  - `crossoverMonth(etf: EtfPoint[], loan: MortgagePoint[]): number | null`. The first month where ETF value ≥ the loan balance (a loan missing past payoff counts as 0).
  - `offsetVsInvest(p: { mortgage: MortgageInput; etf: EtfInput; spareCents: number; distributionYieldBps: number; taxRateBps: number; atMonth: number }): { monthsSooner: number | null; extraEtfCents: number }`.
    - `monthsSooner` = baseline payoff − payoff with `offsetGrowthCents + spare`. It is null when the baseline isn't paid off within 600 months but the new one is: show "pays it off within 50 years".
    - `extraEtfCents` = the ETF value at `atMonth` with `monthly + spare` at the effective return, minus the same with `monthly` at the effective return.

- [ ] **Step 1: Write failing tests:**
  - `requiredRepayment(60000000, 600, 360)` = 359730 (±1 cent).
  - `amortise` with that repayment and no offset pays off at month 360 (±1).
  - $100k offset on a $600k loan → paid off sooner, and interest saved > 0.
  - **Offset > loan → interest 0 every month, paid off by repayments alone, saved ≥ 0.**
  - **Repayment below interest → `payoffMonth: null`, 601 points, no NaN.**
  - Rate change +100 bps → later payoff. A negative rate floors at 0.
  - Weekly 1000 → monthly 4333.
  - `crossoverMonth`: never → null; already crossed → 0.
  - `offsetVsInvest`: monthsSooner > 0 and extraEtfCents > 0. A tax rate of 4500 and a yield of 300 lower `extraEtfCents` compared with tax 0.
- [ ] **Step 2: Run** `cd packages/core && npx vitest run test/projections-mortgage.test.ts test/projections-both.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cd packages/core && npx vitest run && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat(core): mortgage amortisation, crossover and offset-vs-invest`.

### Task 3: API — projection profile and pre-fill

**Files:**
- Create: `apps/api/migrations/0007_projections.sql`, `apps/api/src/db/projections.ts`, `apps/api/src/routes/projections.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/projections.test.ts`, `apps/api/test/migrations.test.ts` (extend)

**Migration:** `projection_profile` has one row (`id int primary key default 1 check (id = 1)`) and these columns:
- `birth_date date`
- `tax_rate_bps int check (tax_rate_bps between 0 and 6000)`
- `mortgage_rate_bps int check (between 0 and 2000)`
- `repayment_cents bigint check (> 0)`
- `repayment_frequency text not null default 'monthly' check (in ('weekly','fortnightly','monthly'))`
- `term_months int check (between 1 and 600)`
- `offset_growth_cents bigint not null default 0`
- `return_bps int not null default 700 check (between 0 and 2000)`
- `inflation_bps int not null default 250 check (between 0 and 1000)`
- `distribution_yield_bps int not null default 300 check (between 0 and 1500)`
- `target_cents bigint not null default 100000000 check (> 0)`
- `target_age int not null default 60 check (between 18 and 100)`
- `todays_dollars boolean not null default false`
- `updated_at timestamptz not null default now()`

Insert the default row with `on conflict do nothing`. The migration must be idempotent.

**Routes:**
- `GET /projections` returns `{ profile: ProjectionProfile; prefill: { etfStartCents; etfMonthlyCents; mortgageBalanceCents; offsetCents; today } }`. It uses at most 4 queries. `profile` is in camelCase, with nulls for unset fields. Pre-fill:
  - `etfStartCents` = Σ balance of accounts with `projections = 'etf'`;
  - `etfMonthlyCents` = `max(0, avgMonthlyInvestmentCents(trades, today))` from the CommSec trades, or 0;
  - `mortgageBalanceCents` = −Σ balance of accounts with `projections = 'mortgage'` and `kind = 'mortgage'` (balances are negative), floored at 0;
  - `offsetCents` = Σ balance of `is_offset` accounts, floored at 0.
- `PUT /projections/profile`:
  - It takes a partial body with the same camelCase fields. Each field is validated against the DB ranges. `birthDate` must be a real date that is not in the future, or null.
  - Unknown keys or bad values → 400 `bad_profile`.
  - It returns the updated profile.

- [ ] **Step 1: Write failing tests:**
  - the migration runs twice;
  - the default profile;
  - pre-fill from seeded accounts: an etf account, a mortgage account at −60000000, two offsets and CommSec trades;
  - PUT partial updates;
  - validation (a future birth date, tax 7000, an unknown key);
  - auth 401.
- [ ] **Step 2: Run** `cd apps/api && npx vitest run test/projections.test.ts test/migrations.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cd apps/api && npx vitest run && npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat(api): projection profile and pre-fill`.

### Task 4: Mobile — hooks, Slider, About you and the home loan form

**Files:**
- Create: `apps/mobile/src/components/Slider.tsx`, `apps/mobile/src/components/Disclaimer.tsx`, `apps/mobile/app/about-you.tsx`, `apps/mobile/app/home-loan.tsx`
- Modify:
  - `apps/mobile/src/api/types.ts`, `apps/mobile/src/api/hooks.ts`: `useProjections()` with key `['projections']`; `useUpdateProfile()` invalidates `['projections']`.
  - `apps/mobile/app/_layout.tsx`: register both routes in `Stack.Protected`.
  - `apps/mobile/app/(tabs)/more.tsx`: rows `🎂 About you` (subline "Birth date and tax rate") and `🏦 Home loan` (subline "Rate, repayment and term"), in the Money settings group.
- Test: `apps/mobile/__tests__/slider.test.tsx`, `apps/mobile/__tests__/about-you.test.tsx`, `apps/mobile/__tests__/home-loan.test.tsx`, `more.test.tsx` (extend), `connect.test.tsx` (must still pass)

**Behaviour:**
- `Slider`:
  - Props: `{ label; value; min; max; step; onChange; format: (v) => ReactNode; accessibilityLabel }`.
  - Drag with `PanResponder`. The track is `line`, the fill lime, and the thumb a 22 px circle.
  - `accessibilityRole="adjustable"`, with `accessibilityActions` increment/decrement that move by one step (this is how tests drive it).
  - The value label is rendered through `format`, so dollar sliders pass `<Amount>` and are masked.
- `Disclaimer`: the exact copy in small muted text.
- **About you:**
  - Birth date field (dd/mm/yyyy, as in Plan 4's AsOfField).
  - Tax-rate pills `0%`, `16%`, `30%`, `37%`, `45%`, and "Other" (free %, one decimal).
  - Each pill includes the hint "plus 2% Medicare levy if it applies" as a muted line.
  - Save → `PUT`. Errors show inline.
- **Home loan:**
  - Rate (%, two decimals); repayment ($) with Weekly/Fortnightly/Monthly segments; term left (years and months).
  - "Offset grows by $ a month".
  - When the repayment is blank, a "Use the minimum: $X" button fills it from `requiredRepayment`.
  - Save → `PUT`.

- [ ] **Step 1: Write failing tests:**
  - Slider: increment/decrement actions clamp to min and max, and the step is respected.
  - About you: saves `birthDate` and `taxRateBps: 3000` for the 30% pill; rejects a future date.
  - Home loan: saves rate 6.24 → `mortgageRateBps: 624`; "Use the minimum" fills from `requiredRepayment`.
  - More: shows both rows.
- [ ] **Step 2: Run** `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i --forceExit slider about-you home-loan more connect`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, then `npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat(mobile): about you, home loan form and slider`.

### Task 5: Mobile — Projections tab, ETFs mode (screen P)

**Files:**
- Create: `apps/mobile/src/components/ProjectionChart.tsx` (shared by every mode), `apps/mobile/src/projections/useProjectionState.ts` (session-only overrides plus saved profile values; saves profile fields when a slider is released, debounced to 1 s)
- Modify: `apps/mobile/app/(tabs)/projections.tsx`
- Test: `apps/mobile/__tests__/projections-etf.test.tsx`

**Behaviour** (match the right panel of `00-style-home-spending-projections.html`):
- Segmented `ETFs · Mortgage · Both`, defaulting to ETFs.
- **Headline:** "At 60 you'd have" + `<Amount>` (or "In N years you'd have" without a birth date), with a lime crayon underline.
- **Note:** "Hits $1M in 2041 (age 51)", "Already there", or "Doesn't reach $1M by 100".
- **`ProjectionChart`:**
  - stacked areas: contributions (`line`) under growth (lime);
  - x axis in years, y axis in abbreviated dollars;
  - a dashed crayon target line labelled with the target year in the handwritten font;
  - a vertical age marker at the chosen age;
  - a legend;
  - masked labels under hide balances.
  - Horizon: until 10 years after the target age, at most 600 months, and at least until the target month when that is reached.
- **Sliders:** starting value (pre-filled), monthly contribution (pre-filled), expected return 0–12% in 0.25% steps, target $100k–$5M, age 30–90. Plus a toggle "Show in today's dollars".
- Footer: `Disclaimer`. Plus an "Add your birth date" link when there's no birth date.

- [ ] **Step 1: Write failing tests (mocked `useProjections`):**
  - the headline value matches core `projectEtf` for the pre-fill;
  - incrementing the monthly slider changes the headline;
  - "Already there" when the start ≥ the target;
  - no birth date → "In N years" and the link;
  - the today's-dollars toggle lowers the headline;
  - hide balances masks the headline, axis labels and slider values;
  - the disclaimer is present.
- [ ] **Step 2: Run** `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i --forceExit projections-etf`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, then `npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat(mobile): projections tab — ETFs`.

### Task 6: Mobile — Mortgage mode (screen 6)

**Files:**
- Modify: `apps/mobile/app/(tabs)/projections.tsx` (or a `ProjectionsMortgage` component under `src/projections/`)
- Test: `apps/mobile/__tests__/projections-mortgage.test.tsx`

**Behaviour** (match the Mortgage half of `06-projections-mortgage-both.html`):
- **Headline:** "Mortgage-free" + month and year with a blue crayon underline. The note says "N years M months sooner than your term, thanks to your offsets", or "Not paid off at this repayment".
- **Chart:** loan with offsets (blue solid), loan without offsets (muted dashed), and the offset balance as a blue-tinted area. Axes and a legend.
- **Tiles:** "Interest saved" and "Interest left", each with `<Amount>`.
- **Sliders:** extra repayment $0–$5,000 a month and rate change −2% to +3% in 0.25% steps (session only).
- Collapsed rows "Loan" (balance, rate, repayment, term) and "Offsets" (combined balance, grows by). Tapping either opens `/home-loan`.
- With no mortgage balance or no saved rate and term → a card "Set up your home loan", which opens `/home-loan`.
- Disclaimer.

- [ ] **Step 1: Write failing tests:**
  - the headline date matches core `compareOffset`;
  - the "sooner" note;
  - an unpayable repayment → "Not paid off at this repayment";
  - the setup card when the term is missing;
  - the extra-repayment slider brings the date earlier;
  - masked tiles under hide balances.
- [ ] **Step 2: Run** `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i --forceExit projections-mortgage`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, then `npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat(mobile): projections — mortgage`.

### Task 7: Mobile — Both mode and offset vs invest

**Files:**
- Modify: `apps/mobile/app/(tabs)/projections.tsx` (or `src/projections/ProjectionsBoth.tsx`)
- Test: `apps/mobile/__tests__/projections-both.test.tsx`

**Behaviour** (match the Both half of `06-projections-mortgage-both.html`):
- **Headline:** "ETFs overtake your mortgage in 2034", or "Your ETFs already cover the loan", or "Not within 50 years".
- **Chart:** ETF value (lime) and loan owing (blue) on one chart. A crayon circle marks the crossover, and the age marker is shown.
- **At-age tiles:** ETFs, Loan, Net (ETFs − loan), each with `<Amount>`.
- **Spare-cash slider:** $0–$3,000 a month, default $500. Two rows:
  - "Into offsets → mortgage-free N years M months sooner";
  - "Into ETFs → +$Y at 60", after tax drag at the saved tax rate.
  - When no tax rate is saved, show "Add your tax rate for a fairer comparison", linking to About you.
- **Assumptions line:** "7% return · 2.5% inflation · 3% distributions taxed at 30%".
- Disclaimer.
- Missing mortgage → the same setup card as in Mortgage mode.

- [ ] **Step 1: Write failing tests:**
  - the crossover year matches core;
  - "already cover";
  - the spare slider changes both rows;
  - the tax-rate prompt when unset;
  - the setup card;
  - masked tiles.
- [ ] **Step 2: Run** `cd apps/mobile && NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i --forceExit projections-both`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, then `npx tsc --noEmit`. Expected: pass.
- [ ] **Step 5: Commit** `feat(mobile): projections — both and offset vs invest`.

### Task 8: Docs and verification

**Files:**
- Modify: `README.md` ("Plan 6 setup")

- [ ] **Step 1:** README "Plan 6 setup":
  1. Run the migration and expect `applied 0007_projections.sql`.
  2. Run `npx wrangler deploy`.
  3. Build a new APK.
  4. In the app, fill in More → About you and More → Home loan.

  Then the phone checks:
  - ETFs headline vs a rough calculator;
  - mortgage-free date close to the bank's own estimate for the current repayment;
  - an extra-repayment slider that moves the date earlier;
  - hide balances masking every figure.
- [ ] **Step 2: Full verification:**
  - core `npx vitest run`;
  - api `npx vitest run`;
  - mobile `NODE_OPTIONS=--max-old-space-size=2048 npx jest --ci -i --forceExit`;
  - `npx tsc --noEmit` in all three;
  - `npx expo install --check`.

  Expected: all green.
- [ ] **Step 3: Commit** `docs: Plan 6 setup`.

## Not in this plan

- Renaming, recolouring and deleting categories; editing rules.
- A notification history screen.
- Net-worth backfill.
- Dividends and DRP.
- Fixed-rate or split loans, since the owner has a single variable loan.
- Super projections.
