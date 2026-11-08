# Current state — idea vs shipped

Where Placard stands relative to the original thesis. The current release contract is [v1.0.0 readiness](release-1.0.md). The [original build checklist](implementation-phases.md) remains available as implementation history.

**v1 at a glance (2026-11-08):** planned features are implemented and local
automated checks have passed. The user reports successful Docker and script
installations, Coolify deployment, physical-phone use, and a 500+ Takeout import.
Recovery with real media remains unverified. Publishing v1.0.0 is on hold until
that check passes; see the [remaining-work checklist](release-1.0.md#still-to-do-before-publishing).

## The first idea (unchanged)

From [vision.md](vision.md):

> Collect places → organize them → enrich them → **act on them**.

North star: Immich for media → **Placard for places** — a private library with rich cards, plus modules (restaurants first) and **MCP** so agents can use the same library.

Primary jobs for the founder ([first-user.md](first-user.md)):

1. Import + browse (~500 Takeout places)
2. Search the library better than Google Maps Saved
3. Pick / spin for dinner (via a Marketplace module such as `places.pick`)
4. Dish photos when useful

That thesis still holds. What changed is *how far the code got*, and a few things we built **ahead of** the original phase list.

## What works today (code + CI)

Phases **0–10** are implemented in code. On a local Aspire or Compose stack you can:

| Job | Where |
| --- | --- |
| Sign up (first user = admin), invite others, block/unblock or delete members, household toggle, profile, Google key + units | `/setup`, `/settings/*` |
| Add places (autocomplete, Google map POI, OSM pin) | `/add` |
| Browse Near me / City / All; household Everyone / Mine / Shared; filter; map or grid | `/` |
| Tags, lists, status, bulk actions, soft delete | `/lists`, `/deleted`, place card |
| Per-place custom fields; merge vs force Google refresh | place detail |
| Enrichment + force refresh all | place detail, admin settings |
| Preferred maps app (device-local) | Settings / place “Open in maps” |
| Cmd+K palette (search + module actions) | `⌘K` / `Ctrl+K` |
| Takeout: parse → free triage → commit → Needs review → undo | `/import` |
| Dish / place photos; Google cover when Details returns photos | place detail |
| Marketplace modules (zip upload or public GitHub Release) | `/settings/marketplace` |
| MCP: PAT + Streamable HTTP `/mcp` (core tools + installed module tools) | `/settings/mcp` |
| Export library zip (JSON + GeoJSON + media) | Settings → General |
| Install as PWA (manifest + icons) | browser “Add to Home Screen” |

Stack in practice: **Vite React SPA + Effect HttpApi + PostGIS + Better Auth + Aspire (dev) + Compose (deploy)**. Phase 0 was rebuilt onto this after an earlier Nest/Next sketch; that rewrite is the real foundation.

## Built outside the original phase plan

These are real product surface, not side experiments:

| Addition | Why it mattered |
| --- | --- |
| **Trusted module marketplace** (catalog, install/uninstall, zip upload, per-user “show in nav”) | [architecture-modules.md](architecture-modules.md) Phase B + C-lite shipped early |
| **GitHub module installs** | Public repo → latest Release asset; update check + Marketplace Update |
| **Module SDK + authoring docs** | [creating-modules.md](creating-modules.md); Pick wheel in sibling `placard-places-pick`; skeleton in-tree |
| **Settings IA** | Side-nav: General, MCP, Marketplace, Integrations, People; module prefs under Marketplace |
| **Vinyl Crate Library UI** | Card-first library with cover sleeves (`apps/web/DESIGN.md`) |
| **Google place covers** | Enrichment can sync a cover from Places photos |
| **City autocomplete** | Library “City” center uses Places `(cities)` instead of hard-coded presets |
| **Cmd+K + library density** | Global palette; modules can contribute navigate-only actions |
| **Custom fields** | Per-place typed fields beyond Google facts |
| **Household place sharing** | Admin toggle; `visibility=household`; claim-first conflict; library ownership filters |
| **MCP `list_lists`** | Extra tool beyond the Phase 9 list |

mvp.md originally parked “third-party modules / SDK / manifest” under Later — that work is **in tree now** as *trusted admin plugins* (no sandbox, no public store). Scope freeze was updated to match. Dinner-spin itself is a **module you install**, not a bundled first-party package.

## Manual release checks

**In tree:** per-user export zip; PWA manifest/icons; [install.md](install.md); GHCR release workflow + changelog.

**User-reported results recorded on 2026-11-08:**

| Check | Outcome and environment |
| --- | --- |
| Docker installation | Working well; host OS and exact version not supplied. |
| Script installation | Working well; shell and exact version not supplied. |
| Coolify installation | Working with a generated domain and updated `PUBLIC_URL`; easy and fast. |
| Real Takeout import | Working with 500+ items; exact count and deployment not supplied. |
| Physical-phone check | Confirmed OK; device/browser and detailed flow results not supplied. |

**Still required before v1:** backup and restore of a representative instance with
its actual media into separate recovery volumes. Follow [Backup and restore](backup-restore.md)
and record the date, version, environment, counts, verification results, and any
problems here. The automated recovery pass below does not complete this manual check.
The user has explicitly placed the release on hold pending recovery.

## Validation evidence

**Automated verification (2026-11-02):** typecheck, 112 unit tests, 76 integration
tests, 13 browser tests, published-doc links, and web/site production builds passed
locally. The household browser test also covers search responses arriving out of
order. `pnpm check:recovery` passed against a disposable Compose stack: fresh install,
backup, volume removal, restore, and verification of account login, a place, photo
and thumbnail hashes, and module-volume files. CI and release tags now run a
shared validation workflow, including this recovery test, before publishing images. These checks
do not replace the manual real-media recovery rehearsal above.

**Operator recovery helper (2026-11-08):** seven failure-path checks passed.
A disposable Docker instance passed the new helper's backup and isolated restore,
including existing-account login, a place, matching original photo/thumbnail hashes,
and a module file. The source services restarted after backup, the recovery media
and module volumes were distinct, and a literal dollar sign in the auth secret
survived Compose generation. This fixture test does not complete the real-media
release check.

## Explicitly later (still true)

| Item | Notes |
| --- | --- |
| Dinner **vote** module | Household mode required (toggle + place sharing shipped); vote UI not built |
| Shared lists | Lists stay `private` only |
| Per-member Google key | Instance key only |
| One-click backup UI | Documented `pg_dump` + volumes for now |
| OSM enrichment / NL search / native apps / OIDC | Unchanged from mvp Out |
| Public module store / sandboxed plugins | Trusted zip / GitHub only |

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
