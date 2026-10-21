# Plan 1: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sideloadable Android APK with the four-tab shell, the full design system in light and dark modes, settings for theme and hide balances, and a fingerprint/PIN lock. It uses no bank data yet.

**Architecture:** An npm-workspaces monorepo:
- `packages/core`: pure TypeScript domain logic (money, dates), unit-tested with Vitest, and later shared with the Supabase Edge Functions.
- `apps/mobile`: the Expo (React Native) app, using expo-router tabs and tested with jest-expo and React Native Testing Library.
- The backend (Supabase) starts in Plan 2.

**Tech Stack:** TypeScript (strict), Expo (latest stable SDK at scaffold time), expo-router, react-native-svg, expo-local-authentication, @expo-google-fonts (Bricolage Grotesque, Caveat), zustand + @react-native-async-storage/async-storage, @date-fns/tz + date-fns v4, Vitest, jest-expo, @testing-library/react-native, EAS Build.

**Spec:** `docs/superpowers/specs/2026-10-22-curly-journey-v1-design.md` (product) and `docs/superpowers/specs/2026-10-22-curly-journey-v1-visual-design.md` (visual). Executors read both.

## Global Constraints

- Android only, sideloaded APK; no Play Store, no iOS work.
- Money is integer cents (`Cents = number`, always an integer). Never use floats for stored amounts.
- All months are calendar months in `Australia/Sydney`.
- Negative amounts display with a true minus sign `−` (U+2212), e.g. `−$2,310`.
- Hide balances masks every dollar amount as `$•••`; percentages, dates and names stay visible.
- Body text is at least 14sp. Chart axis labels are at least 11sp.
- Fonts: Bricolage Grotesque 500/800 for all UI; Caveat 700 only for handwritten notes.
- Theme: follows the system, with override System / Light / Dark. Token values are copied exactly from visual spec §2.1 and §2.1a.
- The lock triggers on app open and after more than 5 minutes in the background. The device PIN is allowed as a fallback.
- No secrets in the app bundle.
- Package id: `com.curlyjourney.app`; display name: `Curly Journey`.

## Review Focus

1. **Sydney DST month edges.** A transaction at 00:30 local time on the 1st must land in the new month, including across the DST start (4 Oct 2026) and end (5 Apr 2026). Pinned in Task 2.
2. **Hide balances everywhere.** Turning it on masks every `<Amount>`, survives an app restart, and never masks percentages. Pinned in Tasks 1, 5 and 7.
3. **Negative and large amounts.** `−$2,310`, `$1,177,000`, and the short forms `$1.2M`, `$400k`, `$1.2k`, `$500`. Pinned in Task 1.
4. **The system theme changes while the app is open.** With the setting on "System", the UI switches without a restart; an explicit Light or Dark choice ignores the system. Pinned in Task 4.
5. **Short app switches don't relock.** Under 5 minutes in the background keeps the app unlocked; exactly 5 minutes and over relocks; a failed or cancelled authentication keeps the lock screen up. Pinned in Task 8.

## File map

```
package.json                       npm workspaces root
tsconfig.base.json
packages/core/
  package.json, tsconfig.json, vitest.config.ts
  src/money.ts                     Cents, formatAud, formatAudShort
  src/dates.ts                     TZ, monthKey, monthBounds, addMonths
  src/index.ts
  test/money.test.ts
  test/dates.test.ts
apps/mobile/
  app.json, eas.json, package.json, tsconfig.json, jest.config.js
  app/_layout.tsx                  fonts, theme, LockGate, Stack
  app/(tabs)/_layout.tsx           Accounts · Spending · Projections · More
  app/(tabs)/index.tsx             Accounts (placeholder content)
  app/(tabs)/spending.tsx
  app/(tabs)/projections.tsx
  app/(tabs)/more.tsx
  app/settings.tsx                 theme, hide balances, home chart
  app/design-system.tsx            component gallery for owner review
  src/theme/tokens.ts
  src/theme/useTheme.ts
  src/settings/store.ts
  src/components/AppText.tsx
  src/components/Amount.tsx
  src/components/Screen.tsx        bg + paper grain
  src/components/HeroCard.tsx
  src/components/Card.tsx
  src/components/Pill.tsx
  src/components/Segmented.tsx
  src/components/MonthSwitcher.tsx
  src/components/IconTile.tsx
  src/components/Button.tsx
  src/components/Toggle.tsx
  src/components/doodles/wobble.ts
  src/components/doodles/CrayonUnderline.tsx
  src/components/doodles/SunDoodle.tsx
  src/components/doodles/HandNote.tsx
  src/lock/shouldLock.ts
  src/lock/LockGate.tsx
  assets/grain-dark.png, assets/grain-light.png
  scripts/make-grain.mjs           generates the two grain tiles
  __tests__/...
```

---

### Task 1: Monorepo and money formatting

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/money.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/money.test.ts`

**Interfaces:**
- Produces:
  - `type Cents = number`
  - `formatAud(cents: Cents, opts?: { hidden?: boolean; decimals?: 'always' | 'never'; signed?: boolean }): string`
  - `formatAudShort(cents: Cents, opts?: { hidden?: boolean }): string`
  - All exported from `@curly/core`.

- [ ] **Step 1: Root workspace.** Create `package.json` with `"private": true` and `"workspaces": ["packages/*", "apps/*"]`, plus `tsconfig.base.json` (strict, ES2022, moduleResolution bundler). In `packages/core`, set the name to `@curly/core`, add a `"test": "vitest run"` script, and add Vitest as a devDependency. Run `npm install`.

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { formatAud, formatAudShort } from '../src/money';

describe('formatAud', () => {
  it('formats with cents by default', () => expect(formatAud(8420)).toBe('$84.20'));
  it('groups thousands', () => expect(formatAud(117700000, { decimals: 'never' })).toBe('$1,177,000'));
  it('uses a true minus sign', () => expect(formatAud(-231000, { decimals: 'never' })).toBe('−$2,310'));
  it('adds + when signed and positive', () => expect(formatAud(470000, { signed: true, decimals: 'never' })).toBe('+$4,700'));
  it('masks when hidden', () => expect(formatAud(-231000, { hidden: true })).toBe('$•••'));
  it('rounds never-decimals half away from zero', () => expect(formatAud(-12350, { decimals: 'never' })).toBe('−$124'));
  it('rejects non-integer cents', () => expect(() => formatAud(10.5)).toThrow());
});

describe('formatAudShort', () => {
  it('under 1k is whole dollars', () => expect(formatAudShort(50000)).toBe('$500'));
  it('thousands to one decimal, trimmed', () => {
    expect(formatAudShort(120000)).toBe('$1.2k');
    expect(formatAudShort(40000000)).toBe('$400k');
  });
  it('millions', () => expect(formatAudShort(120000000)).toBe('$1.2M'));
  it('negative', () => expect(formatAudShort(-21400000)).toBe('−$214k'));
  it('zero', () => expect(formatAudShort(0)).toBe('$0'));
  it('masks when hidden', () => expect(formatAudShort(120000, { hidden: true })).toBe('$•••'));
});
```

- [ ] **Step 3: Run the tests to verify they fail.** Run `npm test -w @curly/core`. Expected: FAIL, cannot resolve `../src/money`.

- [ ] **Step 4: Implement `formatAud` and `formatAudShort` in `packages/core/src/money.ts`.** Use `Intl.NumberFormat('en-AU')` for grouping. Build the sign by hand with `−`/`+` rather than relying on Intl. Throw `RangeError` when `!Number.isInteger(cents)`. Re-export from `src/index.ts`.

- [ ] **Step 5: Run the tests to verify they pass.** Run `npm test -w @curly/core`. Expected: PASS (13 tests).

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(core): workspace and AUD money formatting"`

### Task 2: Sydney calendar months

**Files:**
- Create: `packages/core/src/dates.ts`; modify `packages/core/src/index.ts`
- Test: `packages/core/test/dates.test.ts`

**Interfaces:**
- Produces:
  - `TZ = 'Australia/Sydney'`
  - `monthKey(instant: Date): string` (format `YYYY-MM`)
  - `monthBounds(key: string): { start: Date; end: Date }` (UTC instants; `end` exclusive, i.e. the next month's start)
  - `addMonths(key: string, n: number): string`

- [ ] **Step 1: Write the failing tests**

```ts
import { monthKey, monthBounds, addMonths } from '../src/dates';

it('00:30 AEST on 1 Oct is October', () =>
  expect(monthKey(new Date('2026-09-30T14:30:00Z'))).toBe('2026-10'));
it('23:59 AEST on 30 Sep is September', () =>
  expect(monthKey(new Date('2026-09-30T13:59:00Z'))).toBe('2026-09'));
it('October bounds span the DST start (AEST to AEDT)', () => {
  const { start, end } = monthBounds('2026-10');
  expect(start.toISOString()).toBe('2026-09-30T14:00:00.000Z'); // AEST +10
  expect(end.toISOString()).toBe('2026-10-31T13:00:00.000Z');   // AEDT +11
});
it('April bounds span the DST end', () => {
  const { start, end } = monthBounds('2026-04');
  expect(start.toISOString()).toBe('2026-03-31T13:00:00.000Z');
  expect(end.toISOString()).toBe('2026-04-30T14:00:00.000Z');
});
it('addMonths wraps the year', () => {
  expect(addMonths('2026-11', 2)).toBe('2027-01');
  expect(addMonths('2026-01', -1)).toBe('2025-12');
});
it('rejects malformed keys', () => expect(() => monthBounds('2026-13')).toThrow());
```

- [ ] **Step 2: Run the tests to verify they fail.** Run `npm test -w @curly/core -- dates`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement the three functions in `dates.ts`** using `TZDate` from `@date-fns/tz` (add it and `date-fns` v4 as dependencies).

- [ ] **Step 4: Run the tests to verify they pass.** Run `npm test -w @curly/core`. Expected: PASS (all money and dates tests).

- [ ] **Step 5: Commit.** `git commit -am "feat(core): Sydney calendar month helpers"`

### Task 3: Expo app with four tabs

**Files:**
- Create: `apps/mobile/` via `npx create-expo-app@latest apps/mobile --template tabs`, then trim the template to the file map
- Create: `app/(tabs)/_layout.tsx`, `index.tsx`, `spending.tsx`, `projections.tsx`, `more.tsx`; `jest.config.js`
- Test: `apps/mobile/__tests__/tabs.test.tsx`

**Interfaces:**
- Consumes: `@curly/core` (add it as a workspace dependency; configure Metro `watchFolders` to include `packages/core`)
- Produces: route names `index`, `spending`, `projections`, `more`; tab labels `Accounts`, `Spending`, `Projections`, `More`

- [ ] **Step 1: Scaffold the app.** Run `npx create-expo-app@latest apps/mobile --template tabs`. Delete the template's demo screens and components. In `app.json`, set `name: "Curly Journey"`, `android.package: "com.curlyjourney.app"` and `userInterfaceStyle: "automatic"`. Add `jest-expo` and `@testing-library/react-native`, and add a `"test": "jest"` script.

- [ ] **Step 2: Write the failing test**

```tsx
import { renderRouter, screen } from 'expo-router/testing-library';

it('shows the four tabs in order', async () => {
  renderRouter('./app', { initialUrl: '/' });
  const labels = (await screen.findAllByRole('tab')).map(t => t.props.accessibilityLabel ?? '');
  expect(labels.map(l => l.split(',')[0])).toEqual(['Accounts', 'Spending', 'Projections', 'More']);
});
```

- [ ] **Step 3: Run the test to verify it fails.** Run `npm test -w apps/mobile -- tabs`. Expected: FAIL, because the labels differ from the template's.

- [ ] **Step 4: Implement the tab layout.** Each tab screen renders its title as a placeholder.

- [ ] **Step 5: Run the test to verify it passes.** Run `npm test -w apps/mobile -- tabs`. Expected: PASS. Then run `npx expo start` and open the app on an Android emulator or Expo Go to confirm it launches with four tabs.

- [ ] **Step 6: Commit.** `git commit -am "feat(mobile): expo app with four tabs"`

### Task 4: Theme tokens, settings store and theme resolution

**Files:**
- Create: `src/theme/tokens.ts`, `src/theme/useTheme.ts`, `src/settings/store.ts`
- Test: `__tests__/theme.test.ts`, `__tests__/settings.test.ts`

**Interfaces:**
- Produces:
  - `type Mode = 'dark' | 'light'`
  - `type ThemeTokens` with keys `bg, surface, surfaceSunken, surfaceEdge, line, ink, inkMuted, inkFaded, inkOnAccent, noteLime, notePink, strokeLime, strokeYellow, chartLime`
  - `accents = { orange: '#ff7a45', lime: '#c6f36b', blue: '#7aa2ff', yellow: '#ffd23f', pink: '#ff8fb1', purple: '#b69cff', cream: '#fff4ea', spendRed: '#ff5c5c' }`
  - `themes: Record<Mode, ThemeTokens>`
  - `resolveMode(setting: 'system' | Mode, system: Mode | null | undefined): Mode` (a null or undefined system value resolves to `'dark'`)
  - `useTheme(): ThemeTokens & { mode: Mode }`
  - `useSettings` (zustand, persisted to AsyncStorage under the key `curly-settings`). State: `{ themeMode: 'system' | Mode; hideBalances: boolean; homeChart: 'sixMonths' | 'thisMonth' }`. Defaults: `system`, `false`, `sixMonths`. Setters: `setThemeMode`, `setHideBalances`, `setHomeChart`.

- [ ] **Step 1: Write the failing tests**

```ts
import { themes, resolveMode } from '../src/theme/tokens';
import { useSettings } from '../src/settings/store';

it('dark tokens match the visual spec', () =>
  expect(themes.dark).toMatchObject({ bg: '#241f31', surface: '#342c47', line: '#4a4163', ink: '#f4efe6', inkMuted: '#c4bdd4', inkFaded: '#7d7494', inkOnAccent: '#16131f', noteLime: '#c6f36b', notePink: '#ff8fb1' }));
it('light tokens match the visual spec', () =>
  expect(themes.light).toMatchObject({ bg: '#f6efe3', surface: '#ffffff', surfaceSunken: '#f6efe3', surfaceEdge: '#ddd1bd', line: '#ddd1bd', ink: '#241f31', inkMuted: '#625a76', inkFaded: '#a69d8c', noteLime: '#4c7a0e', notePink: '#c2416b', strokeLime: '#5f9412', strokeYellow: '#e0a100', chartLime: '#5f9412' }));
it('system follows the phone', () => {
  expect(resolveMode('system', 'light')).toBe('light');
  expect(resolveMode('system', null)).toBe('dark');
});
it('explicit choice ignores the phone', () => expect(resolveMode('dark', 'light')).toBe('dark'));
it('settings defaults and setters', () => {
  expect(useSettings.getState()).toMatchObject({ themeMode: 'system', hideBalances: false, homeChart: 'sixMonths' });
  useSettings.getState().setHideBalances(true);
  expect(useSettings.getState().hideBalances).toBe(true);
});
```

(Put `resolveMode` in `tokens.ts` so it stays pure. `useTheme.ts` combines it with `useColorScheme()` and `useSettings`.)

- [ ] **Step 2: Run the tests to verify they fail.** Run `npm test -w apps/mobile -- theme settings`. Expected: FAIL, modules not found. Mock AsyncStorage with `@react-native-async-storage/async-storage/jest/async-storage-mock`.

- [ ] **Step 3: Implement `tokens.ts`, `useTheme.ts` and `store.ts`** with the interfaces and values above. Dark `surfaceEdge` is `'transparent'`; `surfaceSunken`, `strokeLime`, `strokeYellow` and `chartLime` take their dark values from visual spec §2.1 and §2.1a.

- [ ] **Step 4: Run the tests to verify they pass.** Run `npm test -w apps/mobile -- theme settings`. Expected: PASS.

- [ ] **Step 5: Add a test that the theme follows the system at runtime.** Render a probe component that shows `useTheme().mode`. Mock `useColorScheme` to return `'dark'`, then rerender with it returning `'light'`. Expect the text to change from `dark` to `light`. With `themeMode: 'dark'`, expect it to stay `dark`. Run it and see it pass.

- [ ] **Step 6: Commit.** `git commit -am "feat(mobile): theme tokens, settings store, system theme"`

### Task 5: Fonts, text and amounts

**Files:**
- Create: `src/components/AppText.tsx`, `src/components/Amount.tsx`; modify `app/_layout.tsx` (load fonts and keep the splash screen up until they load)
- Test: `__tests__/amount.test.tsx`

**Interfaces:**
- Consumes: `formatAud` and `formatAudShort` (Task 1); `useTheme` and `useSettings` (Task 4)
- Produces:
  - `<AppText variant="hero" | "title" | "body" | "bodyStrong" | "label" | "note" | "axis" tone?="ink" | "muted" | "faded" | "onAccent">`. Sizes and weights: hero 36/800, title 22/800, body 14/500, bodyStrong 14/800, label 13/500, note Caveat 19/700, axis 11/500.
  - `<Amount cents: Cents variant? decimals? signed? short? tone?>`. This is the **only** way to render money in the app.

- [ ] **Step 1: Write the failing tests**

```tsx
it('renders formatted cents', () => {
  render(<Amount cents={-231000} decimals="never" />);
  expect(screen.getByText('−$2,310')).toBeTruthy();
});
it('masks when hide balances is on', () => {
  useSettings.setState({ hideBalances: true });
  render(<><Amount cents={8420} /><AppText>92%</AppText></>);
  expect(screen.getByText('$•••')).toBeTruthy();
  expect(screen.getByText('92%')).toBeTruthy();
});
it('short form', () => {
  useSettings.setState({ hideBalances: false });
  render(<Amount cents={40000000} short />);
  expect(screen.getByText('$400k')).toBeTruthy();
});
```

- [ ] **Step 2: Run the tests to verify they fail.** Run `npm test -w apps/mobile -- amount`. Expected: FAIL.

- [ ] **Step 3: Implement `AppText` and `Amount`.** Load `BricolageGrotesque_500Medium`, `BricolageGrotesque_800ExtraBold` and `Caveat_700Bold` from `@expo-google-fonts/*` in `_layout.tsx`.

- [ ] **Step 4: Run the tests to verify they pass.** Run `npm test -w apps/mobile -- amount`. Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -am "feat(mobile): typography and Amount component"`

### Task 6: Core components, paper grain and doodles

**Files:**
- Create: `Screen.tsx`, `HeroCard.tsx`, `Card.tsx`, `Pill.tsx`, `Segmented.tsx`, `MonthSwitcher.tsx`, `IconTile.tsx`, `Button.tsx`, `Toggle.tsx`, `doodles/wobble.ts`, `doodles/CrayonUnderline.tsx`, `doodles/SunDoodle.tsx`, `doodles/HandNote.tsx`, `scripts/make-grain.mjs`, `assets/grain-*.png`, `app/design-system.tsx`
- Test: `__tests__/wobble.test.ts`, `__tests__/components.test.tsx`

**Interfaces:**
- Consumes: `useTheme`, `accents`, `AppText`, `Amount`, `monthKey`/`addMonths` (for MonthSwitcher)
- Produces:
  - `wobblePath(width: number, opts: { seed: number; amplitude?: number }): string`: an SVG path `d` for a hand-drawn horizontal stroke. Deterministic for a given seed. Endpoints at x=3 and x=width−3. All y values within ±amplitude (default 3) of the midline.
  - `<CrayonUnderline width color seed?>`: renders `wobblePath` at stroke width 4 with round caps and slight opacity breaks (two overlapping strokes at 0.85 and 0.5 opacity).
  - `<Screen>`: fills `bg` and tiles `grain-dark.png` or `grain-light.png` by mode, using `ImageBackground` with `resizeMode="repeat"`.
  - `<HeroCard>`: orange; radii 26/26/26/6 (top-left, top-right, bottom-right, bottom-left = 6).
  - `<Card>` (radius 18; adds `surfaceEdge` as a 1px bottom border).
  - `<Pill tone="ok" | "warn" | "neutral" | "chip">`
  - `<Segmented options value onChange>`
  - `<MonthSwitcher value: string onChange>`: displays e.g. "October 2026".
  - `<IconTile emoji color size?>` (28px, radius 9)
  - `<Button kind="primary" | "secondary">`
  - `<Toggle value onChange>`
  - `<SunDoodle>` and `<HandNote tone="lime" | "pink">` (Caveat, using `noteLime` or `notePink`).

- [ ] **Step 1: Write the failing tests**

```ts
it('wobblePath is deterministic per seed', () =>
  expect(wobblePath(150, { seed: 7 })).toBe(wobblePath(150, { seed: 7 })));
it('wobblePath differs across seeds', () =>
  expect(wobblePath(150, { seed: 1 })).not.toBe(wobblePath(150, { seed: 2 })));
it('wobblePath stays in bounds', () => {
  const nums = wobblePath(150, { seed: 3, amplitude: 3 }).match(/-?\d+(\.\d+)?/g)!.map(Number);
  const ys = nums.filter((_, i) => i % 2 === 1);
  ys.forEach(y => expect(Math.abs(y - 7)).toBeLessThanOrEqual(3)); // midline 7 in a 14-high box
  expect(nums[0]).toBe(3);
  expect(nums[nums.length - 2]).toBe(147);
});
```
```tsx
it('HeroCard has the signature corner', () => {
  render(<HeroCard testID="h" />);
  expect(screen.getByTestId('h')).toHaveStyle({ borderBottomLeftRadius: 6, borderTopLeftRadius: 26, backgroundColor: '#ff7a45' });
});
it('MonthSwitcher steps months', () => {
  const onChange = jest.fn();
  render(<MonthSwitcher value="2026-01" onChange={onChange} />);
  expect(screen.getByText('January 2026')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Previous month'));
  expect(onChange).toHaveBeenCalledWith('2025-12');
});
```

- [ ] **Step 2: Run the tests to verify they fail.** Run `npm test -w apps/mobile -- wobble components`. Expected: FAIL.

- [ ] **Step 3: Implement `wobblePath`.** Use a seeded PRNG (mulberry32) to place 5 control points at even x intervals with random y offsets, and join them with a smooth cubic curve. The path box is 14 high, with the midline at y=7.

- [ ] **Step 4: Implement the components.** Write `scripts/make-grain.mjs`, which generates two 180×180 PNG noise tiles with `pngjs`:
  - dark: white at about 10% alpha;
  - light: `rgb(64,46,26)` at about 12% alpha.

  Run it once and commit the PNGs.

- [ ] **Step 5: Run the tests to verify they pass.** Run `npm test -w apps/mobile`. Expected: all PASS.

- [ ] **Step 6: Build the design system gallery** (`app/design-system.tsx`, linked from More). It shows every component in the current theme: a HeroCard with an underlined `<Amount>`, the sun, a HandNote "up $6.2k since Sept", pills, a segmented control, the month switcher, icon tiles, buttons and toggles. Check it by eye against `docs/design/mockups/00-style-home-spending-projections.html` and `00-light-mode.html` in both modes.

- [ ] **Step 7: Commit.** `git commit -am "feat(mobile): core components, paper grain, crayon doodles"`

### Task 7: Settings screen

**Files:**
- Create: `app/settings.tsx`; modify `app/(tabs)/more.tsx` (an "App" group linking to Settings and to the Design system)
- Test: `__tests__/settings-screen.test.tsx`

**Interfaces:**
- Consumes: `useSettings`, `Segmented`, `Toggle`, `Card`, `AppText`

- [ ] **Step 1: Write the failing tests**

```tsx
it('changes theme mode', () => {
  render(<SettingsScreen />);
  fireEvent.press(screen.getByText('Light'));
  expect(useSettings.getState().themeMode).toBe('light');
});
it('toggles hide balances', () => {
  render(<SettingsScreen />);
  fireEvent(screen.getByLabelText('Hide balances'), 'valueChange', true);
  expect(useSettings.getState().hideBalances).toBe(true);
});
it('switches the home chart', () => {
  render(<SettingsScreen />);
  fireEvent.press(screen.getByText('This month'));
  expect(useSettings.getState().homeChart).toBe('thisMonth');
});
it('persists across restarts', async () => {
  useSettings.getState().setHideBalances(true);
  await useSettings.persist.rehydrate();
  expect(useSettings.getState().hideBalances).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail.** Run `npm test -w apps/mobile -- settings-screen`. Expected: FAIL.

- [ ] **Step 3: Implement the Settings screen.** Copy, in this order:
  - Appearance: System / Light / Dark
  - Hide balances
  - Home chart: Last 6 months / This month

- [ ] **Step 4: Run the tests to verify they pass.** Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -am "feat(mobile): settings for theme, hide balances, home chart"`

### Task 8: App lock

**Files:**
- Create: `src/lock/shouldLock.ts`, `src/lock/LockGate.tsx`; modify `app/_layout.tsx` (wrap the app in `LockGate`)
- Test: `__tests__/lock.test.tsx`

**Interfaces:**
- Produces:
  - `LOCK_TIMEOUT_MS = 300_000`
  - `shouldLock(backgroundedAt: number | null, now: number, timeoutMs?: number): boolean`. Returns true when `backgroundedAt === null`, which means a cold start.
  - `<LockGate>`: renders its children only after a successful `LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Curly Journey', disableDeviceFallback: false })`.

- [ ] **Step 1: Write the failing tests**

```ts
it('locks on cold start', () => expect(shouldLock(null, 1000)).toBe(true));
it('stays unlocked under 5 min', () => expect(shouldLock(0, 299_999)).toBe(false));
it('locks at exactly 5 min', () => expect(shouldLock(0, 300_000)).toBe(true));
```
```tsx
it('keeps the lock screen when auth fails', async () => {
  (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: false, error: 'user_cancel' });
  render(<LockGate><AppText>secret</AppText></LockGate>);
  expect(await screen.findByText('Unlock')).toBeTruthy();
  expect(screen.queryByText('secret')).toBeNull();
});
it('shows the app after auth succeeds', async () => {
  (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true });
  render(<LockGate><AppText>secret</AppText></LockGate>);
  expect(await screen.findByText('secret')).toBeTruthy();
});
it('relocks after 5+ min in background', async () => { /* success first, then AppState 'background' at t=0, 'active' at t=300_000 → 'Unlock' visible */ });
```

- [ ] **Step 2: Run the tests to verify they fail.** Run `npm test -w apps/mobile -- lock`. Expected: FAIL.

- [ ] **Step 3: Implement `shouldLock` and `LockGate`.**
  - Listen to `AppState` and record `Date.now()` when the app goes to the background.
  - On `active`, lock if `shouldLock(...)` says so.
  - The lock screen is a `<Screen>` with the sun doodle, "Curly Journey" in the title style, and a primary "Unlock" button that re-prompts.
  - If no biometrics are enrolled and there is no device credential (`isEnrolledAsync()` and `getEnrolledLevelAsync()` both report none), show "Set up a screen lock in Android settings to use Curly Journey" and keep the app locked.

- [ ] **Step 4: Run the tests to verify they pass.** Run `npm test -w apps/mobile`. Expected: all PASS.

- [ ] **Step 5: Commit.** `git commit -am "feat(mobile): biometric/PIN app lock with 5 min relock"`

### Task 9: Sideloadable APK

**Files:**
- Create: `apps/mobile/eas.json`; add a `README` section on how to install

- [ ] **Step 1: Configure EAS.** Add a `preview` profile with `android.buildType: "apk"` and `distribution: "internal"`. Run `npx eas-cli build:configure`. **This step needs the owner:** they must sign in to a free Expo account.

- [ ] **Step 2: Build.** Run `npx eas-cli build -p android --profile preview`. Expected: the build finishes with a downloadable `.apk` URL.

- [ ] **Step 3: Install on the owner's phone.** The owner enables "Install unknown apps" for their browser and installs the APK, then checks each item:
  - The lock prompts on open.
  - The four tabs are present.
  - The theme follows the phone's dark/light setting.
  - Settings overrides the theme, and hide balances works on the Design system screen.

  Record the result in the commit message.

- [ ] **Step 4: Commit.** `git add apps/mobile/eas.json README.md && git commit -m "build(mobile): EAS preview APK profile"`

---

## Later plans (outline; each one is written in full when the previous one ships)

| Plan | Scope (spec sections) | Owner actions first |
|---|---|---|
| **2. Bank sync and accounts** | Supabase project (Sydney), schema for institution/account/transaction/category/merchant/rule/sync_log/settings with RLS; single-user sign-in; PocketSmith sync Edge Function (4-hourly cron + pull-to-refresh, `updated_since`, de-dupe on id); account "counts towards" switches and offset flags; Accounts tab with the real list; account detail with two swipe pages (§9.2, visual screen 1); stale/failed sync pill and banner; bank CSV import with de-dupe preview (§9.12) | PocketSmith Foundation plan + developer key; Supabase project + 2FA; CommBank and Amex CSV exports |
| **3. Spending and categories** | Merchant cleanup; 6-step categorisation pipeline (§9.4) with AU merchant seed and CommBank category list; recategorise + "always" + "update N earlier"; splits; uncategorised inbox; transfer, mortgage and refund detection, plus "not spending" (§9.5); Spending tab; Home hero card with the stacked in/out chart (axes) and the this-month alternative; auto-categorised % | Optional CommBank category screenshot |
| **4. Warnings and calendar** | Spending limits with 80%/100% alerts (§9.6, screen 8); bills and dates calendar, repeats, reminders, auto-paid matching, "Did this get paid?" (§9.7, screen 4); push notifications (Expo + FCM) and per-type notification settings (§9.11) | None |
| **5. Holdings and net worth** | CommSec CSV parser + manual trades; EOD price job; holdings screen (screen 7); trade hint notification; manual assets (super, home) with staleness; daily net-worth snapshots; net worth screen (screen 5) | Sample CommSec CSV |
| **6. Projections** | ETF, Mortgage and Both projection engines in `packages/core` (monthly compounding, amortisation on loan − Σ offsets, offset-vs-invest) with heavy unit tests; Projections tab (screens P and 6) with axes; About you (birth date, tax rate); disclaimer | None |
