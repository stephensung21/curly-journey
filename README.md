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
7. `node scripts/migrate.mjs`. Expect `applied 0001_init.sql`. Later updates add files (Plan 4 adds `0005_planner.sql`); the script applies only the new ones.
8. `node scripts/create-token.mjs`. Save the printed `cj_...` token in your password manager. It is shown once.
9. `Remove-Item Env:DATABASE_URL`
10. `npx wrangler deploy`. Note the `https://curly-journey-api.<you>.workers.dev` URL.
11. In the app's Connect screen, enter the URL and the token. On Accounts, pull down to sync.

To make a new token later, repeat steps 6, 8 and 9. To change a secret, repeat its `wrangler secret put` step.

### Optional secrets

Set these the same way as step 5, from `apps/api`. Paste each value at the prompt, never on the command line. The app works without them; each one switches on a feature.

- `npx wrangler secret put COINSPOT_KEY`: your CoinSpot API key (see below).
- `npx wrangler secret put COINSPOT_SECRET`: the secret that goes with that key.
- `npx wrangler secret put EXPO_ACCESS_TOKEN`: lets the Worker send push notifications securely (see "Push notifications setup").

For CoinSpot: on coinspot.com.au go to Profile, then API, and create a **Read Only** key. Confirm the email CoinSpot sends you. Read Only means the key can see balances but can never trade or withdraw. Without these two secrets, sync simply skips CoinSpot. If CoinSpot is down, your bank sync still finishes.

### Scheduled jobs

The Worker runs two crons, set in `apps/api/wrangler.toml`. You don't need to do anything for them.

- `*/15 * * * *`: sync, every 15 minutes.
- `7 * * * *`: alerts, at 7 minutes past every hour. It checks spending limits and bill reminders, and sends push notifications.

## Push notifications setup (once)

Do this after the backend setup above. Run commands in your own PowerShell window. Never paste any key, token or file contents into chat, and never commit them. `apps/mobile/google-services.json` is gitignored, so Git ignores it.

1. **Firebase project.** Go to console.firebase.google.com and add a project named `curly-journey`. Turn Google Analytics off.
2. **Android app.** In that project, add an Android app with the package name `com.curlyjourney.app`.
3. **Download the config file.** Download `google-services.json` and save it as `apps/mobile/google-services.json`.
4. **Give the file to EAS.** EAS builds in the cloud, so it needs its own copy. From `apps/mobile`:
   `npx eas-cli env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment preview --visibility secret`
5. **Make a Firebase private key.** In Firebase, go to Project settings, then Service accounts, then **Generate new private key**. A `.json` file downloads.
6. **Upload that key to Expo.** From `apps/mobile`, run `npx eas-cli credentials`. Choose Android, then the `preview` profile, then Google Service Account, then the FCM V1 option, and pick the downloaded file.
7. **Delete the downloaded private key file.** It can send notifications as you. Expo keeps its own copy now. Empty the Recycle Bin too.
8. **Expo access token.** At expo.dev, go to Account, then Access tokens, and create one named `curly-journey-push`. Copy it.
9. **Turn on enhanced push security.** In the project settings on expo.dev, switch on "Enhanced security for push notifications".
10. **Give the token to the Worker.** From `apps/api`, run `npx wrangler secret put EXPO_ACCESS_TOKEN` and paste the token at the prompt.
11. **Deploy and rebuild.** From `apps/api`, run `npx wrangler deploy`. Then from `apps/mobile`, run `npx eas-cli build -p android --profile preview` and install the new APK as in "Build and install the APK".
12. **Test.** In the app go to More, then Notifications, then Turn on, then Send a test notification. It should arrive, and tapping it opens Notifications.

Notifications never contain dollar amounts, so hide balances still holds. To watch the Worker while you test, run `npx wrangler tail --format pretty` from `apps/api`.
