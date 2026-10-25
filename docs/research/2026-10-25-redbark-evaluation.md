# Redbark as a bank-data source: evaluation

Date: 2026-10-25. Question from the owner: is Redbark (redbark.com) a better source of bank data than PocketSmith?

**Verdict: not now.** Redbark can't connect Amex Australia, which carries most of the owner's spending. Its data isn't much fresher than PocketSmith's, and the plan with API access costs more. Revisit if Amex Australia joins the Consumer Data Right (CDR).

## What Redbark is

A bank and brokerage sync service run by Redbark Labs (ACN 685 364 729), hosted in Australia. It reads Australian banks through Open Banking (CDR) via Fiskil, an ACCC-accredited data recipient. Connections are read-only and can be revoked at any time. It sends data to Google Sheets, YNAB, Actual Budget and other tools, and offers an API, webhooks and an MCP server.

## Plans (A$ per month; 7-day free trial; about 17% off annual)

| Plan | Price | Connections / accounts | API, webhooks | Brokerage |
|---|---|---|---|---|
| Saver | A$10 | 3 / 12 | No | No |
| Developer | A$16 | 6 / 24 | Yes | No |
| Professional | A$24 | Unlimited | Yes | Holdings and trades |

Curly Journey would need Developer at least, because it reads data through the API.

## Fit against our accounts

| | PocketSmith (current) | Redbark |
|---|---|---|
| CommBank, including the home loan and offset | Yes | Yes, through CDR |
| Up | Yes | Yes, through CDR |
| **Amex Australia** | **Yes** | **No.** Amex hasn't completed CDR enrolment and gives no date. |
| Freshness | About once a day | "A few hours to about 18 hours"; some banks update several times a day |
| Pending transactions | — | Left out by default |
| CommSec | Our CSV import (Plan 5) | Holdings only, no trades, Professional plan only |
| CoinSpot | Our direct API (Plan 4) | Not supported (only Binance, Coinbase and Kraken) |
| History | About 90 days, plus our CSV backfill | Up to 7 years, depending on the bank |

## Strengths

- Official CDR access through an accredited provider. Likely more reliable than PocketSmith's feeds.
- Webhooks on new transactions. The Worker could react to new transactions within hours instead of waiting for the 4-hourly poll, which would speed up limit warnings.
- Up to 7 years of history.
- Security posture: read-only, hosted in Australia, AES-256-GCM token encryption, SOC 2 infrastructure, CREST-accredited penetration test.

## Weaknesses

- **No Amex.** Keeping PocketSmith or CSV imports for Amex alongside Redbark would mean two feeds to pay for and reconcile.
- **API v2 is in beta.** The docs don't say whether transaction IDs stay stable, and our duplicate detection relies on stable source IDs.
- **Rate limits:** 30 to 60 calls a minute per key, and at most 4 heavy requests in flight. That's fine for one user.
- **Brokerage support is weak:** CommSec gives holdings without trades, which is worse than our CSV import.

## What switching would take

If Amex Australia joins CDR: replace the PocketSmith client in `apps/api/src/sync/` with a Redbark client (Bearer key `rbk_live_…`, base URL `https://api.redbark.com/v2`, paginated with `next_page_url`), store the key as a Worker secret, map Redbark account and transaction IDs (`txn_fk_…`) onto our source IDs, and optionally add a signed webhook endpoint. The CoinSpot and CommSec code stays as it is. Estimated effort: about one plan.

## Sources

- https://redbark.com/pricing
- https://redbark.com/docs/help-center/american-express-australia.md
- https://redbark.com/docs/brokerage.md
- https://redbark.com/docs/help-center/transactions-late-or-missing.md
- https://redbark.com/docs/api-reference/v2/overview.md
