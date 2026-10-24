# Plan 4 rulings and deferred minors

Carried from the Plan 4 execution ledger. None affects money totals or blocks merge (final review triage).

## Rulings

- Ruling: the hourly alerts job evaluates limits, not each sync as it finishes (spec §9.6 says "after every sync"). Running alerts as a separate invocation keeps the 50-request budget free for sync. The in-app chip and markers are computed live on read. — Cost if wrong: a limit push arrives up to an hour after the sync that crossed it.
- Ruling: only warnPercent (50–99) is adjustable; 100% is fixed (spec §7 says "80% and 100%, adjustable"). — Cost if wrong: a later migration adds an over-percent column.
- Ruling: the CommSec trade hint (spec §9.11) moves to Plan 5 with the CommSec import it depends on. — Cost if wrong: none until CommSec exists.
- Ruling: push goes through the Expo push service and FCM, with no dollar amounts in notification text (spec §9.11 and visual §8a, hide balances). — Cost if wrong: the owner's Firebase setup effort; amounts can be added later behind a setting.
- Ruling: the CoinSpot key may arrive late because the owner is on remote control. The code treats it as optional, and Task 16 lists it. — Cost if wrong: none.
- Task 2: Ruling: implementer wrote tests with code (no RED run captured) — reviewer found tests assert real outputs incl. DST boundaries and the no-$ rule; accepted, not redone — cost if wrong: a test that can't fail slips through; final review sees this line.
- Ruling: API suite flakes with 30s "Test timed out" under default parallelism on this 22-core machine (2 failures full run; same files pass alone; --maxWorkers=6 → 151/151 in 88s, same duration). Task 6 implementer adds `maxWorkers: 6` to apps/api/vitest.config.ts as its own commit — cost if wrong: slightly slower API runs.
- Task 7: Ruling: POST /notifications/test returns 503 push_unavailable when devices exist but no push client is configured (plan silent) — cost if wrong: one extra error code
- Task 8: Ruling: no deps.push → treated as no devices (auto-tick still runs, nothing claimed or sent) — cost if wrong: none
- Task 8: Ruling: status window widened to [today−40, today+14] so paid-ahead/skipped upcoming bills get no lead reminder (implementer deviation, accepted — matches planner window) — cost if wrong: none, still one query
- Task 9: Ruling: an owner-set partner keeps its flow/flow_source but its pair_id is cleared when its pair is broken (no dangling one-sided pair) — reviewer minor folded into round 1 — cost if wrong: none; owner's flow untouched
- Task 11: Ruling: 'Mark as not paid' shown for any non-null status so a skip can be undone (brief said paid only) — cost if wrong: one extra button on skipped rows
- Ruling: owner feedback becomes Task 13b (brief written by controller: task-13b-brief.md) before Task 14 — same files as Task 13; bank logos are the banks' website icons via Google's favicon service, bundled as assets — cost if wrong: swap three PNGs
- Task 14: Ruling: 503 push_unavailable on the test button shows "Push isn't set up on the server yet" (plan silent) — cost if wrong: one string
- Task 14: Ruling: app.config.js sets googleServicesFile only when GOOGLE_SERVICES_JSON is set or the local file exists (overrides plan's `?? './google-services.json'`) — keeps pre-Firebase APK builds working; push just won't register until Firebase is set up — cost if wrong: none
- Task 16: Ruling: Steps 1–2 (verify, fix pre-existing Expo patch drift, README) run before the final whole-branch review; Steps 3–5 (owner secrets, migrate, deploy, APK, phone checks) wait until after the final review and the owner's go-ahead — cost if wrong: none
- Final: Ruling: fix wave also takes CoinSpot fetch timeout, NaN audbalance guard, history year labels, masked coin units under hide balances (cheap, owner-visible) — cost if wrong: none
- Final: Ruling: residual is load-bearing (owner sees garbage under hide balances) and a one-line fix; resumed the fix implementer for that line only, using '•' escapes; controller verifies bytes instead of a second re-review — cost if wrong: one more commit

## Deferred minors

- Task 1: minor (deferred): no tests for description-contains-name, event-name-contains-merchant, merchant <3 chars guard
- Task 1: minor (deferred): sydneyDate not tested at the DST changeover instants
- Task 1: minor (deferred): parseIso accepts impossible dates (2026-02-30 rolls over)
- Task 1: minor (deferred): month-step recurrence loops from k=0 (linear in distance from startDate)
- Task 2: minor (deferred): limitStatuses amountCents 0 → Infinity/NaN (API validates > 0 in Task 3)
- Task 2: minor (deferred): disabled-bill test doesn't show paid_check stays on
- Task 2: minor (deferred): crypto defaultCounts test in sync.test.ts separate describe, not pocketsmith.test.ts
- Task 3: minor (deferred): PATCH /limits with {} returns 200 no-op; migrations test doesn't assert synced_at/new tables (category kinds are only spending|income, so kind !== 'spending' check is equivalent)
- Task 4: minor (deferred): accountId > int4 range → likely 500 not 400; no tests for payable:true, PATCH null clears, exact 120-day boundary; PUT malformed date returns bad_id
- Task 5: minor (deferred): no Sydney date-boundary test for asOf/needsUpdate; no needsUpdate case one day inside window; name/icon trimmed (unasked); mobile AccountDto pending Task 13
- Task 5: minor (deferred): PUT value on unknown id with invalid body returns 400 before 404
- Task 6: minor (deferred): budget test uses literal 45 not MAX_CALLS; failure test doesn't assert PS rows; skip test lacks status + 5/4 boundary; NaN audbalance not guarded; failure between the 2 upsertCoinspot queries leaves stale holdings vs total until next sync
- Task 7: minor (deferred): expoPush silently drops entries past 100; non-DeviceNotRegistered ticket errors ignored (test route sent can overstate); PushError on /notifications/test → generic 500; 500 test asserts only toThrow, no cap/empty-list tests
- Task 8: minor (deferred): rollback test doesn't cover a pre-claimed key + send failure; 100-message expo cap leaves dropped keys claimed (final review should triage); docstring call-count grouping
- Task 9: minor (deferred): skip guard effectively defensive (top never pending after accept), untested
- Task 10: minor (deferred): edit sheet pre-fills limit amount as plain text even with hide balances; warnPercent outside 70/80/90 shows no selected segment; comment indent; missing-category fallback differs Home vs Spending ('A category' vs 'Unknown') + duplicated warned-limit sort; no hide-balances test on Limits; no delete confirmation; extra LimitMarker.tsx (shared, accepted)
- Task 11: minor (deferred): month-grid tests miss faded past days, 3-dot cap, selected ring; eventColor helper lives in MonthGrid component; Pill 'alert' tone added (accepted); Home 60-day boundary untested; MonthGrid test written after code (no RED)
- Task 12: minor (deferred): saveError not cleared on new save/delete; save/delete failure paths untested; unknown/NaN id renders blank screen with no exit; edited event with non-spending account or lead outside {0,1,2,7} shows no selected chip; import order; invalidation untested (hooks mocked); save not disabled during pending delete and vice versa
- Task 13: minor (deferred): hook URLs not asserted in tests; future-asOf branch untested; ValueSheet keeps typed state on close; unspecified save/delete error strings untested; import order; account-detail.test.tsx untouched (tests in manual-account.test.tsx)
- Task 13b: minor (deferred): reorder test asserts store state rather than setBankOrder call (equivalent)
- Task 14: minor (deferred): '/\evil' passes url filter (in-app only); quiet re-registration untested; toggles default true while prefs load; hooks.ts imports register.ts for side effect; pre-existing `expo install --check` drift (expo, expo-file-system, expo-font, expo-router patch) → Task 16
- Task 14: minor (deferred): ready true→false→true could re-push the same launch response
- Task 15: minor (deferred): press state/ripple not asserted in more.test; t.line+'80' alpha assumes 6-digit hex (true in both themes, same as AccountRow); tile colours not checked against mockup
- Final: minor (deferred): sync push not hour-gated (time-sensitive, accepted); notifications headline reflects OS permission only (self-heals after Firebase)
