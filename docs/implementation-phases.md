# Implementation phases — v0.1

How Placard gets built, in phases. Each phase ends with something you can **run and check yourself**, plus the automated tests that must be green.

Scope comes from [mvp.md](mvp.md). Stack and testing rules come from [tech-stack.md](tech-stack.md). Idea vs code snapshot: [current-state.md](current-state.md).

**Progress:** Phases **0–10 are code-complete**; founder “You check” boxes through Phase 9 are done. Phase **10** founder checks (Coolify / phone / wipe-restore) remain.

## Overview

| Phase | Theme | Status | You can… at the end |
| --- | --- | --- | --- |
| 0 | Foundations | **done** | `aspire run` / `docker compose up` and a healthy empty app |
| 1 | Accounts & settings | **done** | Sign up as admin, invite a user, save the Google key |
| 2 | Places & manual add | **done** | Add places by autocomplete, map click, or pin; browse cards |
| 3 | Organize | **done** | Tag, list, set status, edit, delete and restore places |
| 4 | Enrichment | **done** | See hours/phone/website on cards; refresh one or all |
| 5 | Search | **done** | "Pizza, open now, within 5 km" from your own library |
| 6 | Takeout import | **done** | Import with free triage, Needs review, undo or bulk-delete |
| 7 | Photos | **done** | Add dish photos; Google covers when Details has photos |
| 8 | Decide module | **done** | Spin the wheel (Marketplace install + nav) |
| 9 | MCP | **done** | Search, lists, and decide from Cursor or Claude |
| 10 | Release hardening | **code done** | Export, PWA, install guide, GHCR workflow (founder Coolify DoD open) |

Order followed the original priorities: places and browsing first, then search, then import at scale, then modules and MCP. Manual add came before Takeout because it builds the Places + Google plumbing that import reuses.

### Shipped outside the original Build lists

Work that landed between phases (or ahead of mvp “Later”) and should be treated as part of the product now:

- **Trusted module marketplace** — catalog, instance install/uninstall/enable, admin **prebuilt zip** upload into `PLACARD_MODULES_DIR`, per-user “show in nav”, host routes for plugin pages and `/api/m/<id>/*`. See [architecture-modules.md](architecture-modules.md) (Phase B + C-lite) and [creating-modules.md](creating-modules.md).
- **Settings side-nav** — General, MCP, Marketplace, Integrations, People; module prefs at `/settings/modules/:moduleId` (opened from Marketplace).
- **Vinyl Crate Library UI** — card-first crate/covers design (`apps/web/DESIGN.md`).
- **Google place covers** — Details photos → cover media on enrichment.
- **City autocomplete** — library “City” center via Places `(cities)`, not hard-coded presets.
- **MCP `list_lists`** — extra tool beyond the original Phase 9 set.

---

## Phase 0 — Foundations

**Status:** done (rebuilt on Aspire + Vite + Effect HttpApi).

**Goal:** an empty but real monorepo that builds, tests, runs under Aspire locally, and deploys via Docker Compose.

**Build**

- pnpm workspace: `packages/domain` (HttpApi + schemas), `apps/server` (Effect HttpApi + worker + drizzle), `apps/web` (Vite React + Tailwind + shadcn)
- TypeScript Aspire AppHost (`aspire-apphost/`) for local orchestration
- Effect 4 runtime (`AppLayer` / `withConfig`), `Config` for env vars, optional OTEL when Aspire sets the exporter endpoint
- Drizzle + `drizzle-orm/effect-postgres`, first migration (PostGIS extension + users table)
- Compose: `app`, `worker`, `db` (PostGIS), media (+ modules) volume, healthchecks — hand-maintained for self-hosters
- `GET /api/health` via HttpApi; SPA served from the same server in production
- Biome, typecheck, Vitest + `@effect/vitest` + `HttpApiTest`, Testcontainers, Playwright smoke
- GitHub Actions: lint, typecheck, unit, integration, compose markers, e2e, build image

**You check**

- [x] `aspire run` brings up db, server, worker, and Vite; dashboard shows resources
- [x] `docker compose up` starts all three services and they report healthy
- [x] Opening the app loads (login / library — no longer a placeholder)
- [x] `/api/health` returns OK, and returns an error when the db is stopped
- [x] Starting with a missing required env var fails immediately with a clear message
- [x] CI is green on the first pull request

**Automated**

- Unit: config parsing (valid and invalid), HealthApi handlers via `HttpApiTest`
- Integration: migrations apply cleanly on an empty PostGIS container
- E2E: home page loads; health endpoint returns ok

---

## Phase 1 — Accounts & settings

**Status:** done.

**Goal:** real users with private data, and an admin who configures the instance.

**Build**

- Better Auth: email + password at `/api/auth/*`, sessions in Postgres (Drizzle adapter, `BETTER_AUTH_SECRET` required)
- First signup becomes admin; signup then closes; the admin sends one-time invite links (7 days, revocable, bound to an email)
- Settings: Google API key (instance; tested with a free Places "IDs only" call before saving), km/miles per user
- Auth guard for every page and API route: `Authentication` / `AdminAuthentication` HttpApi middleware with tagged `Unauthorized` (401) and `Forbidden` (403); the SPA redirects to `/login`

**You check**

- [x] First signup on a fresh install is admin
- [x] Second visitor cannot sign up without an invite
- [x] Admin invites a second user; that user logs in and sees an empty, separate library
- [x] Saving the Google key persists across restarts; a bad key shows a clear test-call error
- [x] Switching to miles is remembered per user

**Automated**

- Unit: `BETTER_AUTH_SECRET` config; Google key verifier (accepted, Google's error message, unexpected body, unreachable)
- Integration (full `/api` router in-process on PostGIS): first-user-admin rule, invite-only signup, invite flow (wrong email, reuse, revoke, existing user), members blocked from admin endpoints, per-user settings, Google key test-then-save, sign out / sign in
- E2E (fresh PostGIS per run): sign up → log out → log in; second visitor can't sign up; admin invites a user who gets an empty library and their own unit setting

---

## Phase 2 — Places & manual add

**Status:** done.

**Goal:** the core object exists and you can add places three ways.

**Build**

- `Places` service (SQL over PostGIS, every query scoped to the owner, soft delete) and `GooglePlaces` service (Places API (New) over Effect `HttpClient`, field masks, 10-minute Details cache so preview-then-save costs one call)
- Fake Google: `GoogleFixtureClient` answers Autocomplete, Details and Text Search from fixtures; tests use it and `PLACARD_FAKE_GOOGLE=true` turns it on for E2E. The fixtures are hand-written in Google's documented response format, not recorded from live calls
- Add page (`/add`):
  - Search: Autocomplete with a session token → preview → save (server-side calls, the key never leaves the server for this)
  - Pick on map: Google Maps JavaScript map (`@vis.gl/react-google-maps`); click a point of interest → preview card → add
  - Drop a pin: OpenStreetMap map (Leaflet, tiles from `tile.openstreetmap.org` with attribution) + name + type + optional address; the only option when there's no key
- Duplicate guard on Place ID: the preview says "Already in your library" and links to it; saving again returns the existing place (a partial unique index makes concurrent saves safe)
- Card grid home and place detail page (`/places/:id`: category, address, coordinates, source, "Open in Google / Apple / Organic Maps", remove)
- Minimal enrichment on save: name, address, coordinates, category (mapped from Google types), UTC offset

**You check**

- [x] Add a restaurant by typing its name
- [x] Add a park by clicking it on the map
- [x] Remove the key, add a place by dropping a pin
- [x] Add the same restaurant again: you land on its existing card
- [x] "Open in Google Maps" opens the right place on your phone

**Automated**

- Unit: duplicate detection (handlers via `HttpApiTest`: a saved Place ID never calls Google or inserts), Google response decoding with Schema, Google type → category mapping, map links
- Contract: live `GooglePlaces` against the fixture client (URL, key and field-mask headers, session token, location bias, Google's error messages, missing key, cache expiry)
- Integration: saving stores a PostGIS point (SRID 4326) and the owner; duplicates and concurrent saves give one row; manual pins; validation; privacy between users; soft delete; missing key
- E2E (fake Google): drop a pin without a key; set a key, add a restaurant by typing its name; add it again and land on its card; remove it

---

## Phase 3 — Organize

**Status:** done.

**Goal:** places become your library, not just pins.

**Build**

- Status: want to go / been there (per place, filterable)
- Tags and lists: create, rename, delete, assign; tag names unique per owner (case-insensitive); deleting a list leaves places in the library
- Edit name / category / address / notes / status; `manual_fields` remembers which Google-backed fields the owner set so refreshes leave them alone (`applyEdit` / `applyFetched`)
- Multi-select in the library grid: bulk tag, add to list, set status, delete
- Soft delete with `/deleted` ("Recently deleted"), restore, and a worker purge every hour using Effect `Clock` (30 days)

**You check**

- [x] Create an "Italian restaurants" list and add three places to it
- [x] Tag a place `date-night`, mark it "been there"
- [x] Edit a place's name; it stays edited
- [x] Bulk-delete two places, restore one from "Recently deleted"

**Automated**

- Unit: override rules (`applyEdit` / `applyFetched`)
- Time-based (`TestClock`): purge happens after 30 days, not before
- Integration: list + tag assign; rename/delete list keeps places; edit + filters; bulk delete/restore; bulk fails atomically when a list is missing
- E2E: create list → select places → tag/edit → bulk delete → restore

---

## Phase 4 — Enrichment

**Status:** done.

**Goal:** cards carry real, useful details from Google.

**Build**

- `Enrichment` service: fetch details (hours, phone, website, price level, rating, cuisine/types) into facts with source + `fetched_at`
- `enrich.place` job with retry/backoff on the worker (pg-boss `JobQueue`)
- Facts written synchronously on Google add (same Details call); refresh button per place
- "Force refresh all" in settings with the expected call count and a progress view
- Manual overrides survive a refresh; Google attribution on the place page
- *(extra)* Google photos → place cover when Details returns photo refs

**You check**

- [x] A newly added restaurant shows its opening hours, phone and website within seconds
- [x] Change a phone number by hand, refresh: your number stays
- [x] "Force refresh all" shows the call count before running and progress while running
- [x] Stop the worker during a refresh-all, restart it: it resumes

**Automated**

- Unit: mapping Google details → facts; override precedence; retry policy for rate-limit vs not-found
- Contract: details fixtures including missing fields (tiergarten sparse)
- Integration: save → facts; override survives refresh; refresh-all plan/start/busy

---

## Phase 5 — Search

**Status:** done.

**Goal:** find things in your library better than Google Maps Saved.

**Build**

- `Search` service with one filter Schema: text, type, open now / tonight, radius from you or a chosen point, tag, list, status
- PostGIS radius queries with a GiST index; trigram on name + notes; cuisine/types via `place_facts`
- Open-now / open-tonight evaluation from stored hours and the place's UTC offset (`TestClock`-friendly)
- Library: Near me / City / All, radius, map or grid, distances in km or miles
- *(extra)* City center via Places autocomplete `(cities)` (not presets)

**You check**

- [x] "Pizza, open now, within 5 km" returns the right restaurants
- [x] Same search at a time when they're closed: they drop out
- [x] Switch the radius center to another city: results follow
- [x] With ~500 places, results feel instant

**Automated**

- Unit: filter Schema round-trips; open-now / tonight around midnight and across time zones
- Integration: radius + text against fixtures; open filter accepted; 1,000-place radius under 1s

---

## Phase 6 — Takeout import

**Status:** done.

**Goal:** bring your ~500 saved places in, deciding what to keep before spending API calls.

**Build** (format reference: [takeout-format.md](takeout-format.md), fixtures in `test/fixtures/takeout/`)

- Upload a zip (UI); API also accepts a `files` kind for tests — folder upload in the UI is optional later
- `import.parse` job fills the staging table with no API calls
- Triage screen: table + map, filters (source list, date saved, area, text), keep/skip per entry and in bulk, flags for already-in-library and cross-list duplicates, running count of kept entries and expected API calls, save and resume
- Unresolved entries (no location, `[0,0]`) shown as "needs location", never as a pin
- `import.commit` job: create kept places, recreate lists, match by CID / feature id / name + coordinates, enqueue enrichment
- "Needs review" queue for weak matches (dismiss / accept / resolve in UI)
- Re-import remembers skips and doesn't duplicate
- "Undo import" for a whole run, listing edited places for confirmation first

**You check**

- [x] Import your **real** Takeout export
- [x] Skip a whole old travel list in one action; the API-call count drops accordingly
- [x] Commit; your Google lists appear as Placard lists
- [x] Resolve a few "Needs review" entries
- [x] Import the same export again: no duplicates, skips remembered
- [x] Undo the import: the library goes back to how it was (edited places asked about)

**Automated**

- Unit: parser against every fixture file, including the CSV and URL quirks in [takeout-format.md](takeout-format.md)
- Property: re-importing is idempotent
- Integration: parse → triage → commit → undo against the database, with the fake Google Layer
- E2E: upload the fixture, skip a list, commit, check the lists

---

## Phase 7 — Photos

**Status:** done.

**Goal:** remember what you ate.

**Build**

- `Media` service: upload to the media volume, thumbnails with `sharp`, authenticated serving
- Dish gallery on restaurant cards with optional caption; general photos on any place
- Photos follow the place's soft delete and purge
- *(extra)* `syncGoogleCover` from Places photos into cover media

**You check**

- [x] From your phone, add two dish photos with captions to a restaurant
- [x] They show on the card next time you open it
- [x] Logged out, a photo URL doesn't load
- [x] Deleting and purging the place removes its files from disk

**Automated**

- Integration: upload, thumbnail, auth check, purge removes files
- E2E: upload a dish photo and see it on the card

---

## Phase 8 — Decide module

**Status:** done.

**Goal:** "what should I eat tonight?" in one tap.

**Build**

- `restaurants.decide` as a **bundled Marketplace module** (`@placard/module-restaurants-decide`) that only uses the module host / core services
- Pool: list, tag, or all restaurants (search-results pool not exposed in UI yet)
- Filters: open tonight, distance; optional avoid-recent
- Wheel / spinner reveal → result card; clear message when the pool is empty
- Install / show-in-nav via Marketplace settings; route `/m/restaurants.decide` (`/decide` redirects)

**You check**

- [x] Spin from your "Italian restaurants" list with "open tonight": only open places can win
- [x] Turn on avoid-recent, spin twice: no immediate repeat
- [x] Filter so nothing matches: you get a clear "nothing open" message

**Automated**

- Unit + property: picks are always inside the filtered pool; avoid-recent respected
- Time-based: open-tonight filter at fixed times
- Architecture check: the module imports nothing from core internals (lint rule or test)

---

## Phase 9 — MCP

**Status:** done.

**Goal:** talk to your library from an AI client.

**Build**

- Personal access tokens (create, list, revoke) in settings
- `/mcp` with Streamable HTTP, stateless (Vite proxies `/mcp` in Aspire; Compose serves it on the app origin)
- Tools: `search_places`, `get_place`, `create_place`, `add_to_list`, `set_status`, `list_lists`, `decide_restaurant`, with input schemas from Effect Schemas
- Decide tool registered with the MCP tool set (same rules as the wheel)
- Rate limit, audit log, `MCP_ENABLED` env switch
- Settings → MCP page with Cursor and Claude snippets

**You check**

- [x] Connect Cursor to your instance with a token
- [x] Ask "what pizza places are open near me?": correct answer from your library
- [x] Ask it to add a place to a list: it appears in the UI
- [x] Ask it to pick dinner: same rules as the wheel
- [x] Revoke the token: the client is refused

**Automated**

- Contract: tools list and input schemas; each tool called through the MCP SDK client
- Integration: token auth, user isolation, revoked tokens rejected

---

## Phase 10 — Release hardening (v0.1)

**Status:** code-complete (founder Coolify / phone / wipe-restore checks open).

**Goal:** someone else can install and trust it.

**Shipped**

- Hand-maintained `compose.yaml`, `.env.example`, healthchecks, media + modules volumes
- [deployment.md](deployment.md) + [install.md](install.md) (Compose, Coolify, Google, backup, upgrade)
- Per-user library export zip (`GET /api/export`: JSON + GeoJSON + media)
- PWA manifest + icons + mobile shell tweaks
- CI builds an image; release workflow publishes to GHCR on `v*` tags; [CHANGELOG.md](../CHANGELOG.md)

**You check**

- [ ] Fresh install on Coolify by following only the guide
- [ ] Run every step of the **Definition of done** in [mvp.md](mvp.md)
- [ ] Install Placard on your phone's home screen
- [ ] Back up, wipe, restore: everything comes back, including photos

**Automated**

- Integration: export contains every place, list, tag and media reference
- Release workflow: push `ghcr.io/jobijoba/placard` on version tags

---

## Working rules across phases

1. Each phase is one or more pull requests; every PR keeps CI green.
2. A phase is **code-complete** when automated checks pass. It is **founder-complete** when the **You check** boxes are ticked on a real `docker compose up` (or Coolify).
3. Bugs found during a checkpoint get a failing test first, then the fix.
4. Scope changes go into [mvp.md](mvp.md) before code (or in the same PR that ships the change).
5. If a phase reveals a design problem, update the relevant doc (data model, stack) in the same PR.
6. Work that lands outside a phase’s Build list is recorded in **Shipped outside the original Build lists** (above) and [current-state.md](current-state.md).
