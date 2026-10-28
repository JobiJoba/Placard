---
name: Placard
description: Vinyl Crate Library — your places as covers you own
colors:
  crate: "#1a1612"
  crate-raised: "#2c2620"
  crate-edge: "#3d342c"
  parchment: "#f2ebe0"
  parchment-ink: "#1a1612"
  spine-gold: "#c4a574"
  action: "#8b3a2a"
  action-fg: "#f2ebe0"
  card: "#faf6ef"
typography:
  catalog:
    fontFamily: "Barlow Condensed, sans-serif"
    fontWeight: 600
    letterSpacing: "0.04em"
  body:
    fontFamily: "Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "0.225rem"
  md: "0.3rem"
  lg: "0.375rem"
spacing:
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-fg}"
    rounded: "{rounded.lg}"
  shell-header:
    backgroundColor: "{colors.crate}"
    textColor: "{colors.parchment}"
  place-cover:
    backgroundColor: "{colors.crate}"
    textColor: "{colors.parchment}"
    rounded: "{rounded.sm}"
---

# Design system

## Overview

Placard’s Operate UI is the **Vinyl Crate Library**: dark crate chrome over a parchment work surface. Place covers carry category color in a dense square grid. Brand lives in catalog type, density marks for want/been, and translucent filter sheets — not in costume vinyl hardware or hover layout tricks.

## Colors

- **Crate** `#1a1612` / raised `#2c2620` — shell, covers, dense surfaces
- **Parchment** `#f2ebe0` — page ground and readable work area
- **Spine gold** `#c4a574` — selection, focus, quiet accent
- **Action** `#8b3a2a` — primary actions only (Add, Import primary)
- Category sleeves tint cover gradients; photos (when present later) may carry full color

## Typography

- **Catalog:** Barlow Condensed for Placard wordmark, page titles, place cover names (uppercase tracking)
- **UI body:** system stack (Segoe UI / system-ui) for controls, filters, prose
- Fixed rem scale; no fluid display type on Operate screens

## Layout

- Max content width ~6xl; sticky dark header; mobile bottom nav on crate ground
- Library: search + scope/view toggles, optional translucent filter sheet, then dense square cover grid (optional map)
- Empty library: Import + Add as equal first paths

## Elevation & Depth

- Covers: light offset shadow + gold edge on hover only (no layout change)
- Filter sheets: light blur + inset edge, not glass for decoration
- No zero-offset glow halos

## Shapes

- Small radii (`0.375rem` base) — sleeve stock, not soft consumer pills
- Covers fixed `1 / 1` aspect in a stable grid

## Components

- **Shell:** crate header, parchment main, gold-tinted active nav
- **Place cover:** category sleeve gradient, status density bar (solid = been, hatch = want), checkbox, catalog title
- **Filters:** `.filter-sheet` layered translucent panel
- **Primary button:** action red-brown only where the user can act

## Do's and Don'ts

**Do**

- Keep place covers square and dense in a stable grid
- Prefer Import/Add on empty states
- Reserve action color for actionable controls

**Don't**

- Costume the UI as Netflix rails or vinyl hardware
- Collapse neighbors into spines or reflow the grid on hover
- Use soft large-radius white cards as the Library structure
- Invent public sharing or social proof
- Put Decide / “what to eat tonight” chrome on this surface before modules ship
