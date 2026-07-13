# Fedika — Brand

> **Status: LIVE in production as of 2026-07-13** (merged to `main`).
> Name clearance is still in progress — trademark (KIPI), domain, and app-store
> checks should be pursued in parallel. If a conflict surfaces, be ready to revert.

## Name & tagline
- **Name:** Fedika (coined from Swahili *fedha* = money/finance)
- **Tagline:** Know your money

## Palette
| Role | Hex |
|------|-----|
| Ink (text / dark accents) | `#0D1B2A` |
| Primary blue (accent) | `#1D7EF4` |
| Money green (success / received) | `#0DB187` |
| Light green (highlights) | `#6FE7B7` |
| Purple (secondary accent) | `#A76BFA` |
| Paper (light background) | `#F2F4F7` |

App dark mode stays **neutral near-black** (`#0b0b0c` surfaces), not navy, per product
decision — only the accent/green/purple were swapped to brand values.

## Typography
- **Headings / wordmark:** Poppins
- **Body / UI:** Inter
- **Money figures:** DM Mono (kept for tabular alignment)

## Logo
Concept: letter **F** + **growth bars** + **leaf/wing** = finance + growth.
- Current app asset: `public/favicon.svg` — a clean SVG interpretation used for the
  favicon and the in-app header mark. **This is a stand-in.** Replace it with the
  official vendor SVG when available (drop-in).
- Variants to source from the vendor kit: gradient (primary), monochrome navy
  (small sizes / favicon), white (dark backgrounds), flat solid (print/docs).
- Usage: gradient for large, monochrome navy for the 16px favicon, white on dark.

## Implemented in this branch
- `index.html` title/meta/theme-color, favicon + apple-touch-icon link
- `src/index.css` + `tailwind.config.js`: palette tokens, Poppins/Inter fonts
- Header logo + wordmark in `AppLayout`; "KashBet" → "Fedika" in `config.ts`,
  Dashboard welcome copy, CSV export filename, `package.json` name
- Global swap of old-palette hex/rgba values across components

## Still to do
- Swap `public/favicon.svg` for the official vendor SVG; add real PWA PNG icons
  (192/512) when the PWA/installable item lands
- Finish name clearance (KIPI trademark, domain, app stores)
- `kashbet-*` localStorage keys were intentionally left unchanged (renaming them
  would wipe users' saved state)
