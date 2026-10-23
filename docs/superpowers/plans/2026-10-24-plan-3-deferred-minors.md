# Plan 3 deferred minors and rulings

Carried from the Plan 3 execution ledger so Plan 4 can pick them up. None affects money totals.

## Rulings

- Task 1: Ruling: alias prefix match must end at a word boundary (alias is followed by end of string or a non-alphanumeric char; aliases ending in space/punctuation already satisfy it) — why: brief's bare prefix rule maps 'ATOMIC CAFE' to ATO — cost if wrong: an alias like 'WW METRO' variants without separators would miss
- Task 3: Ruling: notCounted count = distinct outflow txns, omit zero entries; detectFlows outputs auto rows only; runningByDay past month = all days, current month stops at today, future = [] — why: brief left these open — cost if wrong: label/edge tweaks
- Task 3: Ruling: reviewer's O(outflows×inflows) note re-graded to load-bearing — Workers Free CPU is 10ms and the first pipeline run covers a year of rows; Task 5 must make detectFlows index inflows by amount (Map<amount, rows>) — cost if wrong: CPU-limit failures on large windows
- Task 4: Ruling: fix round 1 scope = (a) reconcile once per run via user-level /users/{id}/transactions?start_date&end_date, multi-account upsert per page, ONE combined delete limited to history-started accounts; (b) per-account history page cursor (account.history_cursor, added to 0003) so a multi-page window resumes across runs; (c) delete bounded date <= today; (d) 12-account default-budget test with a multi-page window; (e) tighter mid-reconcile test — why: Important 1 breaks the hard request-limit constraint — cost if wrong: one more client method + column
- Task 4: Ruling: owner category on a replaced pending row is carried to Task 5 (pipeline copies user category/flow from a deleted pending row to the new row with same account, same amount, date ±3) — why: "never overwrite the owner" — cost if wrong: owner re-sorts a pending purchase after it posts
- Task 5: Ruling: carryEdits runs even when the pipeline is skipped for budget, and may use one RESERVE call — why: carried owner edits exist only in memory and would be lost — cost if wrong: a run could end with 0 spare calls before finishSync (test asserts within budget)
- Task 5: Ruling: concerns 1–5 accepted for now (pipeline after first history load, applyFlows uncapped chunks of changed rows, two-stage carryEdits, ruleId not stored, import swallows pipeline errors so rows wait for next sync) — reviewer to grade
- Task 5: Ruling: re-grade reviewer Minor "partner older than since stays normal" to Important — a transfer half left as spending double-counts totals (anti-goal "totals track the bank"); and null-since full-history scan is a CPU risk — both join fix round 1
- Task 8: Ruling: useCreateCategory invalidating only `categories` is correct — a new category can't change totals — cost if wrong: none
- Task 9: Ruling: fix round 1 also includes reviewer minors on labels (use matchText-derived label), trimmed matchText, Back button on loading/error states — cheap, user-visible
- Task 12: Ruling: reverse my earlier "drill-down shows all accounts" ruling — the drill-down total wouldn't match the tapped account bar (totals must track); fix round 1 passes accountId (+ period) through to /category/[id] and its query
- Task 12: Ruling: re-reviewer's NaN accountId note (my extra check, not a finding) parked — accountId only comes from in-app navigation with numeric ids — cost if wrong: a malformed deep link sends accountId=NaN and gets a 400
- Task 16: review Approved; Ruling: re-grade duplicate react-native-gesture-handler copies (3.3.0 app vs 3.4.0 hoisted) to Important — risks the EAS native build and runtime handler state; fix round 1 = root overrides pin ~3.3.0, single copy, expo install --check clean
- Final: Ruling: Critical 1 fix = (a) pipeline derives merchant = cleanMerchant(description_raw) when merchant = '' and writes it back; (b) 0003 resets history_from/history_done/history_cursor for pocketsmith accounts so ps_category/memo/feed_created_at backfill; (c) pipeline only categorises rows on accounts whose history is done, plus csv rows — why: anti-goal "wrong categories"; 0003 not yet deployed so editing it is safe — cost if wrong: history reload takes a few hours of 15-min cron runs before categories appear
- Final: Ruling: Important 2–6 all fixed as the reviewer proposes; Important 5 via a carried_edit table (expire 7 days, retried each pipeline run, fixed query count); Important 6 skips the delete when the fetch returned no ids but the window has rows, and skips/logs when > 30% of window rows would be deleted
- Final: Ruling: cheap minors folded in — setSplits as one CTE statement; clear a history_cursor whose page returns 4xx; orderRules once per run; pipeline BATCH 1000→500 (CPU); Spending sort box says "<N> to sort this month · Sort ›"; encode institution in drill URL
- Final: Ruling: Declined-to-judge items — category rename/delete deferred to a later plan (picker can add); warnings/limits are Plan 4; others accepted as the reviewer states
- Final: Ruling: response field `totalCents` (camelCase) accepted over `total_cents` — matches API convention — cost if wrong: none
- Final: Ruling: residual "carried edit may land on a null-feed-time CSV row" parked — needs a CSV row on a feed account with same amount ±3 days and no owner category; low exposure — cost if wrong: owner's edit lands on a twin CSV row
- Final: Ruling: residual "pipeline skipped during 0003 history reload" accepted — lasts a few cron runs; imports still categorise directly — cost if wrong: categories appear an hour or two later
- Final: Ruling: residual "skipped reconcile delete never retried" accepted for now — guard is a safety net; console.error signals it; revisit in Plan 4 — cost if wrong: rare leftover duplicate pending rows

## Deferred minors

- Task 1: minor (deferred): merchant.test.ts hand-copied PocketSmith titles list drifts from MAP; long lines in pocketsmithCategory.ts
- Task 1: minor (deferred): /up bank/i lacks word boundary (plan-mandated regex)
- Task 1: minor (deferred): no test for longest-alias fallthrough or merchantCategory on a raw alias
- Task 2: minor (deferred): empty matchText matches everything (API validation in Task 6 requires 3–60 chars)
- Task 2: minor (deferred): flow taken only from the first matched rule; a category-only rule ahead of a flow-only rule drops the flow
- Task 2: minor (deferred): ruleId recorded from first matched rule even when category comes from a later step
- Task 3: minor (deferred): no test for byInstitution sorting or zero/negative-net omission
- Task 4: minor (deferred): a persistently failing saved history_cursor makes every run fail (no reset); final review should triage
- Task 4: minor (deferred): offset-paged cursor can skip a boundary row if earlier rows in the window are deleted between runs
- Task 4: minor (deferred): one long window with a cursor monopolises runs until finished
- Task 5: minor (deferred): a row newly turned normal doesn't revisit its former partner; catch-path carry failure loses edits (by design, commented); /imports/commit swallows pipeline error; ruleId not stored; two-stage carry not fully greedy
- Task 6: minor (deferred): flow-only rule applyToPast `updated` counts matched-but-unchanged rows (over-reports N)
- Task 6: minor (deferred): createRule bulk update leaves categorised=false (pipeline re-applies rules first, same result)
- Task 6: minor (deferred): PATCH flow clears pair_id on one side only; partner stays transfer
- Task 6: minor (deferred): setSplits delete+insert not atomic
- Task 6: minor (deferred): test gaps — paired flow kept through pipeline, applyToPast account/amount positives, institution+accountId, account_not_found, category kept through runPipeline
- Task 7: minor (deferred): repo.inbox pairs dtos with rows by index (match by id); unused _ps var; userCategoryByMerchant may suggest income kind; test gaps split+mortgage, institution+accountId
- Task 8: minor (deferred): no tests for mutation invalidation / detail rollback / multi-list optimistic; transfer 60% opacity and line tile not asserted; unresolved category shows ? tile; not_spending without category uses ? like uncategorised; picker state not reset on close; possible keyboard overlap in sheet; Jest open handle
- Task 8: minor (deferred): picker error not cleared on emoji-only retry/success (stale message on reopen)
- Task 9: minor (deferred): not-spending rule future-only without saying so; account row blank until accounts load; no in-flight guard on rapid taps; receivedLabel noon/midnight tests; SplitEditor sign +1 / too-much tests; close animation lost
- Task 10: minor (deferred): institution not encodeURIComponent'd in drill URL; drill-down title empty while categories load, no list loading/empty state; missing tests for chip selected state, refresh order, Unknown fallback, drill-down error; useless useCallback deps
- Task 11: minor (deferred): double-press can accept twice; overlapping-save error message clearing; no loading indicator; no SwipeCard/reduced-motion tests (device check in Task 14); snap animation after swipe on unmounting card
- Task 12: minor (deferred): pager height = tallest page (blank space on Categories) — owner checks on device in Task 14; paging tests don't exercise scroll/momentum/underline/statement reset; rotation offset; underline magic width
- Task 13: minor (deferred): pin axis label lineHeight 16; running-ref guard untested; account-detail.test.tsx:30 formatting; inline month slice with `!`; niceMax no floor; no tapped-month highlight; no opacity/2.5-step tests; last x label box overflows 16px
- Task 15: minor (deferred): import order nits; misleading test title
- Task 15: minor (deferred): persistent mockRejectedValue in open-bank-app test may leak if mocks aren't reset
- Task 16: minor (deferred): reanimated mock needs "extend me" comment; draft snapshot stale during reorder; no rollback test for useReorderAccounts; drag in ScrollView may need simultaneous/blocking gesture config — device check in Task 14
- Task 14: minor (deferred): Rules row no RED for settings tests originally; 'Uncategorised' fallback for a rule with neither category nor flow
- Final: minor (deferred): stale-variable assertion in transactions.test setSplits clear; guard computed across all accounts combined
