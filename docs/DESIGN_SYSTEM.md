# Design system — Azar Neɣ

Source of truth for colour, type and layout. It is derived directly from the reference
screens supplied in `docs/`:

| Reference                                                                         | What it defines                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `docs/web_view.png`                                                               | Desktop web shell: sidebar + hero + category chips                                    |
| `docs/mobile_view_style_color_and_screens.png`                                    | Phone feed: greeting, search, category rail, promo banner, 2-up listing grid, tab bar |
| `docs/azar-neg-logo.svg`, `docs/azar-neg-logo-dark.svg`, `docs/azar-neg-icon.svg` | Brand lockups (served from `public/brand/`)                                           |

Colour values below were sampled from those images, not invented.

## 1. Colour

Tokens live in [`src/client/styles/tokens.css`](../src/client/styles/tokens.css).

| Token                  | Value                 | Sampled from                                       | Use                                           |
| ---------------------- | --------------------- | -------------------------------------------------- | --------------------------------------------- |
| `--brand-600`          | `#1b9b51`             | hero fill `#17a149`, active chip `#19a04d`         | hero gradient mid stop, active states, badges |
| `--brand-700`          | `#14833f`             | sidebar "Se connecter" `#299656` (darkened for AA) | primary buttons, links, nav active text       |
| `--brand-500`          | `#2bbd62`             | hero highlight                                     | hero gradient start, accents                  |
| `--brand-50`           | `#e8f7ee`             | sidebar active pill `#e7f7ed`                      | active nav pill, soft brand surfaces          |
| `--bg`                 | `#f9fbfa`             | page background `#fafbfd`                          | app background                                |
| `--surface`            | `#ffffff`             | cards, sidebar                                     | cards, sidebar, top bar                       |
| `--line`               | `#e5eee8`             | hairline borders                                   | dividers, card borders                        |
| `--ink` / `--ink-soft` | `#0f1f18` / `#2f453b` | near-black text                                    | headings / body                               |
| `--danger`             | `#d13b30`             | —                                                  | destructive actions, moderation               |
| `--accent`             | `#f0a020`             | price stars in the reference                       | highlights, ratings                           |

Notes:

- **The green is intentionally light.** Body-copy contrast is preserved by using the darker
  `--brand-700` (`#14833f`, 4.88:1 on white) for buttons and links, while the large hero
  surface and pills use the brighter `--brand-600`/`--brand-500` stops.
- The hero uses `--grad-hero: linear-gradient(135deg, #2bbd62, #1b9b51 58%, #14833f)`,
  which mirrors the reference's diagonal hero gradient.

## 2. Typography ("style d'écriture")

The reference uses a geometric rounded sans with a **single-storey `a`** and circular
`o`/`e` — Poppins matches it, and Cairo is its Arabic companion.

| Role                          | Family      | Weights                     |
| ----------------------------- | ----------- | --------------------------- |
| Latin UI                      | **Poppins** | 400 / 500 / 600 / 700 / 800 |
| Arabic UI (`html[lang="ar"]`) | **Cairo**   | 400 / 500 / 600 / 700       |

Both are self-hosted through `@fontsource` (imported in
[`src/client/main.tsx`](../src/client/main.tsx)) — no Google Fonts CDN, no runtime
third-party request. The stack is declared once in `tokens.css`:

```css
--font-sans: "Poppins", "Cairo", "Noto Sans Arabic", system-ui, ...;
html[lang="ar"] {
  --font-sans: var(--font-arabic);
}
```

Weights are restricted to the five loaded files; avoid intermediate values such as 550
or 750 (they would be synthesised by the browser).

Type scale (`--text-*`): 12 / 13 / 15 / 16 / 18 / 22 / 28 / 36 / 46 px, headings
`font-weight: 700`, `letter-spacing: -0.02em`, `line-height: 1.18`; hero `h1`
`clamp(1.75rem, 3.6vw, 3.1rem)` with `line-height: 1.06` and a 26ch measure, which
reproduces the reference's two-line headline.

## 3. Layout

Single shell ([`src/client/styles/shell.css`](../src/client/styles/shell.css)) with three
breakpoint behaviours:

|                | ≥961 px (web)                                                             | ≤960 px (phone / tablet)                                                                                                             |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Navigation     | sticky 244 px sidebar, rounded active pill, account buttons under the nav | hidden; bottom tab bar (Accueil, Annonces, **Vendre** raised FAB, Favoris, Compte)                                                   |
| Header         | none — content starts with the hero, exactly as in `docs/web_view.png`    | top bar: app mark, greeting + wilaya count, bell, account, then a pill search field                                                  |
| Home hero      | green gradient card with kicker, headline, lead, search pill + Explorer   | hidden; the top bar carries the greeting and search, the feed starts with categories                                                 |
| Categories     | white chip row with icon + label                                          | horizontally scrollable round icon tiles (76 px cards, 66 px thumbs)                                                                 |
| Listing grid   | 4 columns                                                                 | 2 columns, tighter 10 px gap, no card border                                                                                         |
| Listing detail | gallery left, title/price + seller right                                  | one column in reading order: media → title/price → description → seller → contact, plus a sticky call/WhatsApp bar above the tab bar |
| Footer         | 4-column footer                                                           | hidden (tab bar replaces it)                                                                                                         |

Search page filters collapse behind a "Filtres" toggle on phones; the promo banner
("0 % de commission") is phone-only (`.mobile-only`).

## 4. RTL

Arabic is a first-class locale: `?lang=ar` (or the sidebar switch) sets
`<html lang="ar" dir="rtl">`, swaps the font stack to Cairo and mirrors the shell —
sidebar right, hero text right-aligned, logical CSS properties (`padding-inline`,
`inset-inline`, `margin-inline-start`) used throughout instead of left/right.

## 5. Regenerating the captures

`docs/screens/` holds Playwright-free captures produced from the running dev server:

```bash
npm run dev          # terminal 1
npm run screenshots  # terminal 2 → docs/screens/{web,mobile}-*.png
node scripts/screenshots.mjs --lang=ar   # Arabic/RTL set
```

The script drives a locally installed Edge/Chrome in headless mode (set `CHROME_PATH` to
override). It never downloads a browser and adds no dependency.
