# Owner feedback

Feedback from using the app on the phone, newest last. Each item says what changed and whether it is done.

| # | Date | Screen | Feedback | Status |
|---|---|---|---|---|
| 1 | 2026-10-25 | Accounts (Home) | The pressed highlight on an account row touches the icon and the amount; add left and right padding. | Done: the highlight now extends 8 past the row's content on each side, and the content stays in line with the bank header. Needs a new APK. |
| 2 | 2026-10-25 | Category picker | Let me move categories around in the picker. | Done: Reorder in the picker (hold ≡ and drag, or arrows), saved on the server with Done. Needs a new APK and `wrangler deploy`. |
| 3 | 2026-10-25 | Spending → Transactions | Show which bank each transaction came from. | Done: a small bank logo on the corner of each row's icon, also on the category drill-down. Needs a new APK. |
| 4 | 2026-10-25 | Spending | The page scrolls on past the end of the content. | Done: the swipe pages now take the height of the page on screen (the Transactions page was stretching the Categories page). Needs a new APK. |
| 5 | 2026-10-25 | Accounts (Home) | Show at the top when PocketSmith's data was last updated, not when I last refreshed. | Done: a line under the title, e.g. "Bank data: CommBank today 7:41am · Amex yesterday 9:02pm". It is the newest transaction PocketSmith received from each bank. Needs `wrangler deploy` and a new APK. |
