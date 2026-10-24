# Plan 6: rulings and deferred minors

Plan: `docs/superpowers/plans/2026-10-25-plan-6-projections.md`. Built subagent-driven on `feat/plan-6-projections`, final-reviewed, with fixes in 7f9cce2 and fbcf148. The owner approved building without input on 2026-10-25.

## Rulings

- **Mortgage test value.** The plan's "+100 bps → later payoff" test used a repayment that never pays off a 7% loan within 600 months, so the test uses 420000. Cost if wrong: none.
- **Small UI choices:** the birth date is typed as dd/mm/yyyy; the Medicare hint appears once under the tax pills; "Other" tax accepts 0–60% with one decimal; "Use the minimum" converts to the chosen frequency, rounding up. Cost if wrong: small UI changes.
- **Today's dollars** deflates both ETF series, and the target is compared in today's dollars. Slider ranges: start 0..max($100k, 2×pre-fill) in $1k steps; monthly 0..max($5k, 2×pre-fill) in $50 steps.
- **The age slider is clamped** to current age + 1 .. min(90, current age + 50), because the maths stops at 600 months. A target never reached reads "within 50 years". With no birth date there's a session-only "Years from now" slider (1–50, default 25).
- **Both mode** shares the session's extra repayment and rate change with Mortgage mode. It stays nominal and ignores today's dollars.
- **Mortgage note** is split into "N sooner/later than your term" and "Offsets save you N", so extra repayments aren't credited to the offsets.
- **"Term left" counts down** from `term_set_on`, which is stamped when the term is saved.
- **Offset vs ETFs is like for like:** each arm shows how much better off you'd be at your chosen age.
  - The offset arm counts the extra offset cash and the lower loan.
  - After each arm's payoff, its cash (including the freed repayment) is assumed invested at the same after-tax return. The app says so on screen.
  - Cost if wrong: an owner who wouldn't invest after payoff should read the offset figure as an upper bound.
- **Declined to judge** (plan simplifications):
  - interest is charged monthly, not daily;
  - no capital gains tax, only tax on distributions;
  - session values reset when you open the About you or Home loan forms from the tab.

## Deferred minors

**Core**
- No NaN guard on the ETF inputs; callers validate.
- No tests for the 600-month cap, a December rollover, a month-end birth date, or crossover against an unpaid 600-month loan.

**API**
- `offsetGrowthCents` is unbounded on the server; the app caps it at ±$100k a month.

**Mobile**
- Owners aged 90 or more get a negative `headlineMonth`.
- The "within 50 years" copy shows even when the age horizon is shorter.
- Profile saves send every field.
- Forms are filled from the profile only once.
- Re-saving Home loan re-stamps the term, so it can drift by up to a month.
- Once the term has run out, the minimum repayment is the whole balance over one month.
- `eslint-disable` with a `JSON.stringify` key in Mortgage and Both modes.
- A money helper is duplicated.
- No handwritten "crossover" label on the chart.
- The slider's real drag behaviour inside a vertical scroll needs a phone check.
