# Placard icon

The mark combines a pair of saved-place cards with a map pin. Dark ink forms the
container, parchment the front card, gold the second card, and rust the pin.
Use the icon beside the Placard wordmark; keep its proportions and colors intact.

`placard-icon.svg` is the canonical source. Run `pnpm icons:generate` after editing
it. The script uses the server workspace's existing Sharp dependency and writes
identical assets into the app and marketing site's public directories:

- SVG favicon and 16/32/48-pixel ICO fallback.
- 192- and 512-pixel PNG icons.
- 180-pixel opaque Apple touch icon.
- Dedicated 512-pixel maskable icon with the mark inset into the safe area.

The public site's HTML and wordmark use Vite's base URL so icons work under
GitHub Pages project paths as well as a custom domain. The product app uses its
root-relative paths and references the maskable asset separately in its manifest.
