# curly-journey

A personal finance app for Android: spending across CommBank, Amex and Up, net worth, and ETF and mortgage projections.

Design: `docs/superpowers/specs/`. Plans: `docs/superpowers/plans/`.

## Layout

- `packages/core`: pure TypeScript domain logic (money, dates). Tests: `npm test -w @curly/core`
- `apps/mobile`: the Expo app. Tests: `cd apps/mobile && npx jest --ci -i`
- `apps/api`: the Cloudflare Worker (Hono + Neon). Tests: `npm test -w @curly/api`

## Build and install the APK

1. Sign in to a free Expo account (once): `cd apps/mobile && npx eas-cli login`
2. Link the project (once): `npx eas-cli init`
3. Build: `npx eas-cli build -p android --profile preview`
4. When the build finishes, open the `.apk` link on your phone. Allow "Install unknown apps" for your browser when Android asks, then install.

## Backend setup (once)

Run these in your own PowerShell window, from the repo root. Never paste the connection string, the PocketSmith key or the API token into chat, a file or a commit.

1. In Neon, open your project (Sydney region). Click **Connect**, turn **Connection pooling** on, and copy the connection string.
2. `cd apps/api`
3. `npx wrangler login`. A browser opens. Approve access to your Cloudflare account.
4. `npx wrangler secret put DATABASE_URL`. Paste the Neon connection string at the prompt and press Enter. If wrangler asks to create the Worker, answer yes.
5. `npx wrangler secret put POCKETSMITH_KEY`. Paste the PocketSmith developer key at the prompt.
6. Load the connection string for this window only. `Read-Host` keeps it out of your PowerShell history:
   `$env:DATABASE_URL = Read-Host "Neon connection string"`
7. `node scripts/migrate.mjs`. Expect `applied 0001_init.sql`.
8. `node scripts/create-token.mjs`. Save the printed `cj_...` token in your password manager. It is shown once.
9. `Remove-Item Env:DATABASE_URL`
10. `npx wrangler deploy`. Note the `https://curly-journey-api.<you>.workers.dev` URL.
11. In the app's Connect screen, enter the URL and the token. On Accounts, pull down to sync.

To make a new token later, repeat steps 6, 8 and 9. To change a secret, repeat its `wrangler secret put` step.
