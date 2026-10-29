# Current state — idea vs shipped

Where Placard stands relative to the original thesis. Binding scope remains [mvp.md](mvp.md); the build checklist is [implementation-phases.md](implementation-phases.md).

## The first idea (unchanged)

From [vision.md](vision.md):

> Collect places → organize them → enrich them → **act on them**.

North star: Immich for media → **Placard for places** — a private library with rich cards, plus modules (restaurants first) and **MCP** so agents can use the same library.

Primary jobs for the founder ([first-user.md](first-user.md)):

1. Import + browse (~500 Takeout places)
2. Search the library better than Google Maps Saved
3. Decide / spin for dinner
4. Dish photos when useful

That thesis still holds. What changed is *how far the code got*, and a few things we built **ahead of** the original phase list.

## What works today (code + CI)

Phases **0–9** are implemented. On a local Aspire or Compose stack you can:

| Job | Where |
| --- | --- |
| Sign up (first user = admin), invite others, set Google key + units | `/setup`, `/settings/*` |
| Add places (autocomplete, Google map POI, OSM pin) | `/add` |
| Browse Near me / City / All; filter; map or grid | `/` |
| Tags, lists, status, bulk actions, soft delete | `/lists`, `/deleted`, place card |
| Enrichment + force refresh all | place detail, admin settings |
| Takeout: parse → free triage → commit → Needs review → undo | `/import` |
| Dish / place photos; Google cover when Details returns photos | place detail |
| Decide wheel (install from Marketplace; show in nav) | `/m/restaurants.decide` |
| MCP: PAT + Streamable HTTP `/mcp` (search, get, create, lists, status, decide) | `/settings/mcp` |

Stack in practice: **Vite React SPA + Effect HttpApi + PostGIS + Better Auth + Aspire (dev) + Compose (deploy)**. Phase 0 was rebuilt onto this after an earlier Nest/Next sketch; that rewrite is the real foundation.

## Built outside the original phase plan

These are real product surface, not side experiments:

| Addition | Why it mattered |
| --- | --- |
| **Trusted module marketplace** (catalog, install/uninstall, zip upload, per-user “show in nav”) | Decide became a first-party plugin; [architecture-modules.md](architecture-modules.md) Phase B + C-lite shipped early |
| **Module SDK + authoring docs** | [creating-modules.md](creating-modules.md); example `places-pick` pack |
| **Settings IA** | Side-nav: General, MCP, Marketplace, Integrations, People; module prefs under Marketplace |
| **Vinyl Crate Library UI** | Card-first library with cover sleeves (`apps/web/DESIGN.md`) |
| **Google place covers** | Enrichment can sync a cover from Places photos |
| **City autocomplete** | Library “City” center uses Places `(cities)` instead of hard-coded presets |
| **MCP `list_lists`** | Extra tool beyond the Phase 9 list |

mvp.md originally parked “third-party modules / SDK / manifest” under Later — that work is **in tree now** as *trusted admin plugins* (no sandbox, no public store). Scope freeze was updated to match.

## Still open for v0.1 release (Phase 10)

The library → Decide → MCP loop is usable. Release hardening is not:

- Export all data as **JSON + GeoJSON** (with media manifest)
- **PWA** basics (manifest, icons, mobile layout pass)
- Install guide walkthrough on **Coolify** only
- Published image (**GHCR**), tagged release, changelog
- Founder QA: real Takeout of ~500 places; tick remaining “You check” boxes on Compose

## Explicitly later (still true)

| Item | Notes |
| --- | --- |
| Household shared/private + dinner **vote** | Visibility column exists; only `private` is allowed today |
| Per-member Google key | Instance key only |
| One-click backup UI | Documented `pg_dump` + volumes for now |
| OSM enrichment / NL search / native apps / OIDC | Unchanged from mvp Out |
| Public module store / sandboxed plugins | Trusted zip only |

## Doc map

| Doc | Role now |
| --- | --- |
| [vision.md](vision.md) | Why — still the north star |
| [mvp.md](mvp.md) | What ships in v0.1 (scope contract) |
| [implementation-phases.md](implementation-phases.md) | How we built it; phase status + extras |
| **This file** | Snapshot of idea vs code |
| [product-overview.md](product-overview.md) | Objects, modes, flows (implemented + planned) |
| [architecture-modules.md](architecture-modules.md) | Core vs plugins (as shipped) |
| [mcp.md](mcp.md) | Agent access (implemented) |
| [deployment.md](deployment.md) | Compose / Coolify path |
