# Curly Journey v1 — Visual Design

Date: 2026-10-22
Status: approved by owner, screen by screen, 2026-10-22 (light mode added same day)
Companion to: `2026-10-22-curly-journey-v1-design.md` (the product design). That document says *what* the app does; this one says *how it looks and feels*.

Approved mockups live in `docs/design/mockups/`. They are HTML fragments made for the brainstorm viewer, so standalone they lack the viewer's frame styling, but every phone screen inside them renders correctly in a browser. Where this document and a mockup disagree, this document wins.

## 1. Intent

The owner wants a dark app with **character**, not a sleek "premium card" look. The chosen personality is **playful**: chunky rounded type, warm orange and lime, emoji icons, with **light-touch hand-drawn crayon details**. The closest familiar reference is Up Bank's personality, plus a sketchbook layer.

The owner rejected or adjusted, in order:
- A calm cream/teal Pearler-like look ("too bland").
- A dark premium navy look (too bland and too premium).
- A heavier doodle level. Light touch only, but the sun doodle and the "up $X since …" handwritten note are kept.
- Handwriting for warnings. **Warnings are always plain text.**
- The near-black background. Lifted to dark plum.
- Charts without axes. **Every chart has labelled x and y axes.**

## 2. Design tokens

### 2.1 Colour

| Token | Value | Use |
|---|---|---|
| `bg` | `#241f31` + paper grain (§2.4) | App background |
| `surface` | `#342c47` | Cards, list rows, month switcher, segmented controls, bar tracks |
| `surface-sunken` | `#241f31` | Inputs and chips sitting *inside* a surface card |
| `line` | `#4a4163` | Dividers, dashed outlines, neutral icon tiles (transfer, uncategorised), off switches |
| `ink` | `#f4efe6` | Primary text |
| `ink-muted` | `#c4bdd4` | Secondary text, labels, axis labels |
| `ink-faded` | `#7d7494` | Past days in the calendar |
| `ink-on-accent` | `#16131f` | Text on orange, lime, yellow, blue, pink fills |
| `orange` | `#ff7a45` | Hero card, spending accent, selected segment, warnings highlight |
| `lime` | `#c6f36b` | Primary buttons, positive numbers, growth, net worth, ETFs, "OK" pills, handwritten notes (default) |
| `blue` | `#7aa2ff` | Mortgage, offsets, bills |
| `yellow` | `#ffd23f` | Attention (stale, uncategorised), sun doodle, transport |
| `pink` | `#ff8fb1` | Amex, shopping, subscriptions, "more than last month" notes |
| `purple` | `#b69cff` | Entertainment, super, strata |
| `cream` | `#fff4ea` | Spending bars *on the orange hero card only* |

Contrast rule: body text must meet WCAG AA (4.5:1). On coloured fills use `ink-on-accent`; never grey text on colour.

### 2.1a Light mode (owner decision: both modes in v1)

The app follows the phone's light/dark setting, with an override in Settings › App (System / Light / Dark). Tokens are semantic, with two values each. Accent fills (orange, lime, blue, yellow, pink, purple) and `ink-on-accent` are the **same in both modes**; only these change:

| Token | Dark | Light |
|---|---|---|
| `bg` | `#241f31` + white grain | `#f6efe3` (warm paper) + dark grain |
| `surface` | `#342c47` | `#ffffff`, with a 1px `#ddd1bd` bottom edge |
| `surface-sunken` | `#241f31` | `#f6efe3` |
| `line` | `#4a4163` | `#ddd1bd` |
| `ink` | `#f4efe6` | `#241f31` |
| `ink-muted` | `#c4bdd4` | `#625a76` |
| `ink-faded` | `#7d7494` | `#a69d8c` |
| Handwritten note, lime | `#c6f36b` | `#4c7a0e` |
| Handwritten note, pink | `#ff8fb1` | `#c2416b` |
| Doodle strokes, lime / yellow | `#c6f36b` / `#ffd23f` | `#5f9412` / `#e0a100` |
| Chart lime series / line on `bg` | `#c6f36b` | `#5f9412` |

Light grain: the same noise recipe, tinted dark brown (`rgb(64,46,26)`) at about 12% alpha. Crayon assets need a light-mode colour variant wherever they use lime or yellow strokes. Mockup: `docs/design/mockups/00-light-mode.html`.

### 2.2 Type

- **Bricolage Grotesque** (Google Fonts), weights 500 and 800. All UI text.
- **Caveat** 700. Handwritten notes only (§3).

| Role | Size / weight |
|---|---|
| Hero number (the screen's main figure) | 36–38 / 800, letter-spacing −0.02em |
| Screen title | 22 / 800 |
| Body, list rows | 14 / 500; amounts 800 |
| Secondary, labels | 12–13 / 500, `ink-muted` |
| Chart axis labels | 11 minimum in the real app (mockups use 9–10 at mock scale) |
| Handwritten note | Caveat 17–19 |

Mockups are drawn at roughly 290px phone width. In the real app, body text is at least 14sp.

### 2.3 Shape and spacing

- **Hero card**: radius `26 26 26 6`, with one sharp bottom-left corner. This is the app's signature shape and is used only for the main card on Home (and the balance card on offset account detail).
- Cards and rows: radius 18. Event and list cards: 16. Small icon tiles: 28×28, radius 9.
- Pills, segmented controls and buttons: fully rounded.
- Bottom sheets: radius 26 on the top corners, a grab handle, and a dimmed screen behind.
- Spacing on a 2/4px grid; screen padding 14–16; gap between cards 6–10.
- Floating action button (Calendar add): 52×52, radius 18, lime.

### 2.4 Background texture: paper grain

A fine white speckle over `bg`, like drawing paper. Mockup recipe: an SVG `feTurbulence` fractal noise (baseFrequency 0.85, 3 octaves, stitched) tinted white at about 10% alpha, tiled at 180px. In the app, use a pre-rendered tiling PNG (or a Skia shader) at the same strength. Only the background is textured; cards stay smooth.

## 3. Hand-drawn layer (light touch)

All doodles are crayon-like: slightly wobbly strokes with broken, grainy edges. The mockups achieve this with an SVG displacement and noise filter (`#crayon`). The builder chooses the app technique, such as Skia path effects or pre-drawn SVG/PNG assets.

**Allowed, and where:**

| Element | Where | Colour |
|---|---|---|
| Crayon underline under the hero number | Home, Spending, account detail, net worth, ETF holdings, Mortgage/Both projections | The screen's accent: orange (spending), lime (net worth, ETFs), blue (mortgage), orange (Both) |
| Handwritten note (Caveat) | Next to a hero number for a comparison or encouragement: "up $6.2k since Sept", "$310 more than Sept", "+$11,240 on what you put in", "5 yrs 2 mo sooner, thanks to your offsets" | Lime by default; pink for "more spent" |
| Sun doodle | Top right of **Home only** | Yellow |
| Crayon arrow | From the net worth row on Home towards its note | Lime |
| Crayon tab underline | Active tab in Transactions / Categories | Lime |
| Crayon circle | One key chart moment, e.g. the Both-view crossover | Orange |
| Crayon dashed target line + handwritten label | ETF projection target ("$500k by 2041!") | Orange |
| Crayon illustration | Empty and celebration states, e.g. "All sorted!" in the inbox | Mixed accents |
| Friendly confirmation notes | "nice, one less to sort", "no doubles, we checked", "we'll tick it off when the payment shows up", "super stays out of your spending, promise" | Lime |

**Never:**
- Handwriting for warnings, limits, errors or anything you must act on. These are plain Bricolage text, for example the lime-on-dark pill "Dining out is at 92% of your limit".
- Handwriting for amounts in lists or tables.
- Hatched or wobbly chart bars. Chart marks stay clean; only annotations are hand-drawn.
- More than about two doodle elements on one screen (Home is the exception: underline, sun, arrow and note).

## 4. Voice

- **Labels and data**: plain, short and exact.
- **Handwritten notes**: friendly, a little cheeky, under about 6 words.
- **Warnings**: calm and specific, with no jokes, e.g. "Dining out is at 92% of your limit".
- **Disclaimers** in muted 11–12px under projections: "General information only, not advice."

## 5. Components

| Component | Spec |
|---|---|
| Account row | `surface` row; coloured emoji icon tile; name (plus optional muted subline); bold balance on the right; grouped under institution labels (CommBank, Amex, Up, CommSec, Manual) |
| Transaction row | Icon tile (category colour + emoji); clean merchant name; category as a muted subline; amount on the right. Uncategorised: `line` tile with "?" and a yellow "Uncategorised · tap to sort" subline. Transfers: 60% opacity, "↔" tile, "Transfer · not spending". Income amounts in lime with "+". Upcoming scheduled items: dashed bottom border |
| Day header | 12px muted, e.g. "Today · Thu 22 Oct" |
| Month switcher | Pill on `surface`: ‹ Month Year › |
| Segmented control | Pill track on `surface`; selected segment orange with dark text |
| Category bar | Emoji tile, name, 10px bar in the category colour on a `surface` track, bold amount; dashed vertical marker at a limit if one is set |
| Limit bar | As the category bar, plus a dashed 80% marker; yellow "CLOSE" pill over 80% |
| Status pills | "OK" lime; "update?"/"CLOSE" yellow; "PAID"/"NEW" lime; "HAVE IT" `line` |
| Chip | Dark (`#16131f`) pill with lime text, used for warnings on the hero card |
| Primary button | Lime, dark text, 800 weight. Secondary: `surface` with `ink` text |
| Switch | Lime track with a dark knob when on; `line` track with a muted knob when off |
| Bottom sheet | §2.3; used for the category picker and "remember this" |
| Input field | `surface-sunken` block with a small muted label above the value |
| Page dots | Small `line` dots; the active one is a lime pill |
| Bottom tab bar | Accounts · Spending · Projections · More |

### 5.1 Category colours and emoji

| Category | Colour | Emoji |
|---|---|---|
| Groceries | lime | 🛒 |
| Dining out | orange | 🍜 |
| Coffee | orange | ☕ |
| Transport | yellow | 🚗 |
| Shopping | pink | 🛍️ |
| Bills / utilities | blue | 💡 |
| Entertainment | purple | 🎬 |
| Subscriptions | pink | 📺 |
| Health | blue | 🏥 |
| Income | lime | 💰 |
| Transfer | line | ↔ |
| Uncategorised | line | ? |

The rest of CommBank's category list follows the same pattern; the builder assigns colours from the accent set, and the owner can edit them later.

## 6. Charts

Every chart:
- has **labelled x and y axes**: dates or years on x, dollar amounts on y (abbreviated: $400k, $1.2k);
- has faint dashed gridlines in `line` at the y labels;
- has a legend whenever there is more than one series;
- uses clean marks; only annotations get the crayon treatment (§3);
- uses the app's colours:

| Series | On `bg`/`surface` | On the orange hero card |
|---|---|---|
| Money in | lime | `#16131f` |
| Mortgage | blue | blue |
| Spending | `#ff5c5c` (red, as the owner asked for spending) | cream `#fff4ea` (red is unreadable on orange) |
| ETF growth / contributions | lime area / `line` area | — |
| Loan with offsets / without | blue solid / muted dashed | — |

The Home money in vs out chart is a stacked bar per month (in | mortgage + spending), last 6 months, with the current month at 60% opacity. Tapping a month shows its exact figures. The Settings alternative shows this month's running totals by day.

The Home and net-worth mockups were drawn before the axes rule. The builder adds axes to them too.

## 7. Screens

| # | Screen | Mockup | Key points |
|---|---|---|---|
| H | Home | `00-style-home-spending-projections.html` (left) | Sun doodle; orange hero card with "You've spent this month", the underlined total, a warning chip and the stacked in/out chart; lime net worth row with arrow and "up $X since …" note; next 1–2 calendar events; account list |
| S | Spending | same file (middle) | Month switcher; institution chips (All · CommBank · Amex · Up); underlined total and note; category bars with limit markers; uncategorised box ("3 transactions to sort · Sort ›") with dashed outline; "Not counted as spending" section (from the product design) |
| P | Projections · ETFs | same file (right) | Segmented ETFs · Mortgage · Both; headline at age; lime growth over contributions area; crayon dashed target line with a handwritten label; age marker; sliders |
| 1 | Account detail | `01-account-detail.html` | Fixed header (name, owing/balance, sync time, calendar/statement toggle for Amex, month switcher, underlined spent total, note). Below it **two swipeable pages: Transactions (default) and Categories**, with crayon-underlined tabs and page dots. The same pattern applies to every account. Offset accounts show an "Offset · home loan" badge, an orange balance card with "saving you about $X/mo", and in / spent / mortgage tiles |
| 2 | Transaction detail | `02-transaction-detail.html` | Large icon, clean name, raw description, amount, "Choose category" button, details list, "Counts as" (Spending / Transfer / Mortgage / Not spending), Split, Note. The category picker is a bottom sheet with search and an emoji grid. The "remember" sheet has two switches, on by default: "Always put X in Y" and "Also update N earlier X transactions" |
| 3 | Uncategorised inbox | `03-uncategorised-inbox.html` | Progress bar; stacked cards; best-guess pills with the top one in lime; swipe right to accept the top guess, swipe left to skip; empty state "All sorted!" with a crayon illustration and the auto-categorised % |
| 4 | Bills & dates | `04-bills-calendar.html` | Month grid with coloured dots (today highlighted, past faded); Coming up list; Earlier this month with PAID pills; lime + button. New event form: name, amount, icon, first date, repeat pills, remind-me pills, paid-from account, handwritten reassurance |
| 5 | Net worth | `05-net-worth.html` | Underlined total and note; 1M/6M/1Y/All range pills; lime area chart (add axes); own/owe tiles; Own and Owe lists, with offsets grouped as "Offsets (3)" and stale manual entries tagged "update?". Manual-entry editor: value, as-of date, growth, reminder interval, and the three "counts towards" switches |
| 6 | Projections · Mortgage and Both | `06-projections-mortgage-both.html` | Mortgage: "Mortgage-free <date>" with a blue underline; chart with offsets vs without, plus offsets area; interest saved/left tiles; sliders for extra repayment and rate change; collapsed loan and offset rows. Both: crossover year headline; ETFs vs mortgage chart with a crayon circle on the crossover and an age line; at-age tiles; spare-cash slider with into-offsets vs into-ETFs comparison; assumptions and disclaimer |
| 7 | CommSec | `07-commsec.html` | Underlined value and gain note; allocation bar; holdings cards (units, average cost, value, gain); Import CSV and Add trade buttons. Import: 3-step flow with step bar; preview showing new / already have / skipped counts and NEW / HAVE IT tags; "Import N trades". Hint notification with Import CSV, Add trade and Not a trade actions |
| 8 | More / Settings / Limits | `08-more-settings-limits.html` | Grouped list: shortcuts (Bills, Net worth, Import); Money settings (limits, rules with auto-sort %, categories, home loan & offsets, About you); Connections with status pills; App (fingerprint lock, hide balances, home chart, notifications). Limits: whole-month limit in an orange hero card; category limits with 80% markers; "+ Add a limit" dashed button |

Superseded wireframes, kept only for layout reference: `00-home-layout-wireframe.html` (stacked out bar and the Settings toggle) and `00-projections-wireframe.html` (Mortgage/Both structure). `00-texture-options.html` shows the rejected textures next to the chosen paper grain.

## 8. Motion (builder's call, within these limits)

- Keep it short and springy: 150–250ms, nothing slower than 300ms.
- Swipes (inbox cards, account pages) follow the finger and snap.
- Doodles may "draw in" once when a screen first opens (underline stroke animating left to right, ~300ms). They never loop.
- Respect Android's "remove animations" setting.

## 8a. Claude's calls (owner can override)

| Topic | Call |
|---|---|
| Screens without a mockup | Designed by the builder in this style from §5 components. The owner reviews them on the phone as they're built, not via mockups first. These are: split editor, bank CSV import (same 3-step pattern as CommSec import), category drill-down (transaction list filtered to the category), rules and categories editors, per-account "counts towards" switches (as in the manual-entry editor), loan and offsets setup, About you, lock screen, "Did this get paid?" prompt (bottom sheet: Yes, it's paid / Not yet / Skip this one) |
| Stale or failed sync | The account keeps its last known balance and still counts in totals. The account row shows a yellow "synced 2 days ago" pill once there has been no successful sync for over 36h. Home shows a plain-text banner above the hero card, e.g. "CommBank hasn't updated since Tue · Check", when any Spending-enabled account is stale. A failed sync shows the same banner with "sync failed" |
| Hide balances | Masks every dollar amount everywhere as "$•••", including handwritten notes, chart y-axis labels, projection figures and notification text. Percentages, dates and category names stay visible. All amounts render through one shared amount component |
| Tab bar | Dark: `bg` with a top `line` hairline; light: `surface`. Icon + label; the active tab is `ink` with a short crayon underline in orange; inactive tabs are `ink-muted` |

## 9. Left to the builder

- Implementation technique for crayon strokes and paper grain in React Native.
- Icon set for non-emoji UI glyphs (back, chevrons, search).
- Exact spacing values within the 2/4px grid.
- Loading skeletons and error states, in the same palette.
- Colours for any remaining CommBank categories.
