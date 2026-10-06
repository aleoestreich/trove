# Trove icon set

## brand/
- `app-icon.svg` + `app-icon-512.png`, `app-icon-192.png`: PWA icons (rounded tile).
- `app-icon-maskable.svg` + `app-icon-maskable-512.png`: full-bleed tile for Android adaptive icons (`"purpose": "maskable"` in manifest.json).
- `apple-touch-icon-180.png`, `favicon-32.png`, `favicon-16.png`.
- `mark-on-light.svg` / `mark-on-dark.svg`: the three circles alone (multiply blend on light, screen on dark).
- `wordmark-on-light.svg` / `wordmark-on-dark.svg`: "tr●ve" logo. Uses the Sora font (600) as live text; load Sora from Google Fonts, or rebuild in JSX with the mark replacing the "o".

## banks/
Bank icons (Trove's own outline style, not the official logos), light and dark, 40×40, radius 12.
Badge = 1.5px border in the bank colour at 45% + 8% tint fill; glyph = bank colour mixed 72% with ink, stroke 1.9.
Token mapping: Nubank → series-4, Itaú → series-2, Santander → series-5, Wise → series-3.
The bare glyphs are in ui/bank-*.svg (currentColor): build the badge as a component from the tokens so it follows light/dark mode.

## ui/
24×24 line icons, `stroke="currentColor"`, stroke-width 1.75. Colour them with text tokens (e.g. `text-muted`, `text-accent`).
Tab bar: overview, transactions, accounts, installments. Category icons are prefixed `cat-`.

## categories/
54 category icons, ordered by theme (home & bills, food, transport, shopping, health, family & pets, education & work, leisure, travel, money, other) — 24×24, stroke="currentColor", stroke-width 1.8. File name = icon key stored on the category. `preview.png` shows them all. The category editor shows all 54 in one grid in the order of categories.json (6 per row on a phone, 12 on desktop); no search or tabs.
`categories.json` has the 24 category colour tokens (cat-navy … cat-graphite, in picker order) with a light and a dark value each — add them to the theme as CSS custom properties next to the other tokens (--cat-blue, …) and switch them with dark mode like the rest; a category stores only the colour name (e.g. "orange"). It also has the icon list, and the 10 default categories with subcategories (EN/PT) to seed the database.

Category badge: circle 40×40 (34–38 on desktop), background = colour at 16% (color-mix(in srgb, <hex> 16%, transparent)), icon = colour mixed 72% with --ink, stroke 1.8. Category label text ("Restaurants › Delivery") = colour mixed 70% with --ink. Categories are circles; banks are rounded squares.
Uncategorized: dashed 1.5px circle in --muted with ui/uncategorized.svg. Transfers: --track circle with ui/transfer.svg, no category.
Also new in ui/: eye, eye-off (hide/unhide), sync, cloud-check (sync status), link (link subcategory), tab-categories, trash, edit, plus.
