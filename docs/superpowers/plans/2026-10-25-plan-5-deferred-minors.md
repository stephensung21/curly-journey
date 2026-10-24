# Plan 5: rulings and deferred minors

Plan: `docs/superpowers/plans/2026-10-24-plan-5-holdings-networth.md`. Built subagent-driven on `feat/plan-5-holdings-networth`, final-reviewed, fixes in cbd9b66. Owner approved building without input on 2026-10-25.

## Rulings

- Names `EtfHolding` / `ValuedEtfHolding` (core) and `useCommsec()` with key `['commsec']` (mobile) avoid Plan 4's CoinSpot `Holding` / `useHoldings`. Cost if wrong: renames only.
- Home growth uses `days / 365.25`. A 365-day year lands about 0.03% under ×(1 + g). Cost if wrong: cents on a home value.
- A CSV trade replaces a hand-entered trade when side, symbol and units match and the dates are within 5 days (`TRADE_HINT_DAYS`). The preview lists it as "have" and counts it in `replacing`. Cost if wrong: two genuinely separate same-size trades within 5 days, one entered by hand, would merge.
- The import button is enabled when new + replacing > 0. It reads "Update R trades" when only replacements remain. Cost if wrong: one field.
- Growth "3.5%" is stored as 350 basis points. The plan's "35" was a typo. Cost if wrong: none.
- Final review re-grades, fixed in cbd9b66:
  - "price as of" uses the oldest close, and the app lists symbols with no price yet;
  - a Yahoo close of 0 or below is ignored;
  - today's net-worth point is always the live total.

## Deferred minors (none changes a money total in normal use)

**Core parser**
- A negative Credit on a sell is accepted. It would skew Plan 6's average monthly investment. Reject `totalCents <= 0` when Plan 6 uses it.
- The fingerprint uses the reference only, so partial fills sharing one reference would collapse. CommSec issues one row per contract note.
- Identical rows with no reference inside one CSV collapse into one.
- Missing tests: sell-side half-cent, empty reference, CRLF input.

**Net worth**
- A net-negative offsets group would land in Owe as "Offsets (n)".
- Negative growth rounding can be off by ±1 cent.
- y-axis ticks aren't "nice" values.
- The Offsets line lacks an a11y expanded state.
- No tests for negative or flat y axes.
- The growth field rejects ".5" and "3.50".

**API**
- Bad JSON on trade routes returns `bad_trade`, not `bad_json`.
- The CommSec account gets `synced_at`, unlike the `AccountDto` comment.
- `balance_date` = today even when every price fetch fails.
- No `too_large` / `bad_json` tests on the holdings routes.
- Only the first 10 symbols are priced.
- No exact-boundary tests for the ±5-day hint window or the 14-day lookback.

**Mobile**
- The import step bar has no captions.
- TradeSheet:
  - its error colour differs from the import screen's;
  - its state lingers after closing;
  - "today" is captured at mount.
- Prices show to cents.
- "Imported 0" can appear after a replacements-only import.
- A delete error lingers after a later success.
- The hint banner stays after a trade is added.
- The CommSec account's settings page can't be reached because the screen redirects.
