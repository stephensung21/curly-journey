# curly-journey

A personal finance app for Android: spending across CommBank, Amex and Up, net worth, and ETF and mortgage projections.

Design: `docs/superpowers/specs/`. Plans: `docs/superpowers/plans/`.

## Layout

- `packages/core`: pure TypeScript domain logic (money, dates). Tests: `npm test -w @curly/core`
- `apps/mobile`: the Expo app. Tests: `cd apps/mobile && npx jest --ci -i`

## Build and install the APK

1. Sign in to a free Expo account (once): `cd apps/mobile && npx eas-cli login`
2. Link the project (once): `npx eas-cli init`
3. Build: `npx eas-cli build -p android --profile preview`
4. When the build finishes, open the `.apk` link on your phone. Allow "Install unknown apps" for your browser when Android asks, then install.
