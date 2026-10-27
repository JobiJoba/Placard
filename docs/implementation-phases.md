# Implementation phases — v0.1

How Placard gets built, in phases. Each phase ends with something you can **run and check yourself**, plus the automated tests that must be green. Don't start a phase until the previous one passes its checkpoint.

Scope comes from [mvp.md](mvp.md). Stack and testing rules come from [tech-stack.md](tech-stack.md).

## Overview

| Phase | Theme | You can… at the end |
| --- | --- | --- |
| 0 | Foundations | `docker compose up` and see a healthy empty app |
| 1 | Accounts & settings | Sign up as admin, invite a user, save the Google key |
| 2 | Places & manual add | Add places by autocomplete, map click, or pin; browse cards |
| 3 | Organize | Tag, list, set status, edit, delete and restore places |
| 4 | Enrichment | See hours/phone/website on cards; refresh one or all |
| 5 | Search | "Pizza, open now, within 5 km" from your own library |
| 6 | Takeout import | Import your real export with free triage, then undo or bulk-delete |
| 7 | Photos | Add dish photos to a restaurant card |
| 8 | Decide module | Spin the wheel for tonight |
| 9 | MCP | Search, add to a list, and decide from Cursor or Claude |
| 10 | Release hardening | Deploy on Coolify, export everything, install as a PWA |

Order follows your priorities: places and browsing first, then search, then import at scale, then the modules. Manual add comes before Takeout because it builds the Places + Google plumbing that import reuses.

---

## Phase 0 — Foundations

**Status:** rebuilt on Aspire + Vite + Effect HttpApi. Re-run the checks below after the stack revision.

**Goal:** an empty but real monorepo that builds, tests, runs under Aspire locally, and deploys via Docker Compose.

**Build**

- pnpm workspace: `packages/domain` (HttpApi + schemas), `apps/server` (Effect HttpApi + worker + drizzle), `apps/web` (Vite React + Tailwind + shadcn)
- TypeScript Aspire AppHost (`aspire-apphost/`) for local orchestration
- Effect 4 runtime (`AppLayer` / `withConfig`), `Config` for env vars, optional OTEL when Aspire sets the exporter endpoint
- Drizzle + `drizzle-orm/effect-postgres`, first migration (PostGIS extension + users table)
- Compose: `app`, `worker`, `db` (PostGIS), media volume, healthchecks — hand-maintained for self-hosters
- `GET /api/health` via HttpApi; SPA served from the same server in production
- Biome, typecheck, Vitest + `@effect/vitest` + `HttpApiTest`, Testcontainers, Playwright smoke
- GitHub Actions: lint, typecheck, unit, integration, compose markers, e2e, build image

**You check**

- [ ] `aspire run` brings up db, server, worker, and Vite; dashboard shows resources
- [ ] `docker compose up` starts all three services and they report healthy
- [ ] Opening the app shows a placeholder home page (health status)
- [ ] `/api/health` returns OK, and returns an error when the db is stopped
- [ ] Starting with a missing required env var fails immediately with a clear message
- [ ] CI is green on the first pull request

**Automated**

- Unit: config parsing (valid and invalid), HealthApi handlers via `HttpApiTest`
- Integration: migrations apply cleanly on an empty PostGIS container
- E2E: home page loads; health endpoint returns ok

---

## Phase 1 — Accounts & settings

**Goal:** real users with private data, and an admin who configures the instance.

**Build**

- Better Auth: email + password at `/api/auth/*`, sessions in Postgres (Drizzle adapter, `BETTER_AUTH_SECRET` required)
- First signup becomes admin; signup then closes; the admin sends one-time invite links (7 days, revocable, bound to an email)
- Settings: Google API key (instance; tested with a free Places "IDs only" call before saving), km/miles per user
- Auth guard for every page and API route: `Authentication` / `AdminAuthentication` HttpApi middleware with tagged `Unauthorized` (401) and `Forbidden` (403); the SPA redirects to `/login`

**You check**

- [ ] First signup on a fresh install is admin
- [ ] Second visitor cannot sign up without an invite
- [ ] Admin invites a second user; that user logs in and sees an empty, separate library
- [ ] Saving the Google key persists across restarts; a bad key shows a clear test-call error
- [ ] Switching to miles is remembered per user

**Automated**

- Unit: `BETTER_AUTH_SECRET` config; Google key verifier (accepted, Google's error message, unexpected body, unreachable)
- Integration (full `/api` router in-process on PostGIS): first-user-admin rule, invite-only signup, invite flow (wrong email, reuse, revoke, existing user), members blocked from admin endpoints, per-user settings, Google key test-then-save, sign out / sign in
- E2E (fresh PostGIS per run): sign up → log out → log in; second visitor can't sign up; admin invites a user who gets an empty library and their own unit setting

---

## Phase 2 — Places & manual add

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

- [ ] Add a restaurant by typing its name
- [ ] Add a park by clicking it on the map
- [ ] Remove the key, add a place by dropping a pin
- [ ] Add the same restaurant again: you land on its existing card
- [ ] "Open in Google Maps" opens the right place on your phone

**Automated**

- Unit: duplicate detection (handlers via `HttpApiTest`: a saved Place ID never calls Google or inserts), Google response decoding with Schema, Google type → category mapping, map links
- Contract: live `GooglePlaces` against the fixture client (URL, key and field-mask headers, session token, location bias, Google's error messages, missing key, cache expiry)
- Integration: saving stores a PostGIS point (SRID 4326) and the owner; duplicates and concurrent saves give one row; manual pins; validation; privacy between users; soft delete; missing key
- E2E (fake Google): drop a pin without a key; set a key, add a restaurant by typing its name; add it again and land on its card; remove it

---

## Phase 3 — Organize

**Goal:** places become your library, not just pins.

**Build**

- Status: want to go / been there (per place, filterable)
- Tags and lists: create, rename, delete, assign; tag names unique per owner (case-insensitive); deleting a list leaves places in the library
- Edit name / category / address / notes / status; `manual_fields` remembers which Google-backed fields the owner set so refreshes leave them alone (`applyEdit` / `applyFetched`)
- Multi-select in the library grid: bulk tag, add to list, set status, delete
- Soft delete with `/deleted` ("Recently deleted"), restore, and a worker purge every hour using Effect `Clock` (30 days)

**You check**

- [ ] Create an "Italian restaurants" list and add three places to it
- [ ] Tag a place `date-night`, mark it "been there"
- [ ] Edit a place's name; it stays edited
- [ ] Bulk-delete two places, restore one from "Recently deleted"

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

**You check**

- [ ] A newly added restaurant shows its opening hours, phone and website within seconds
- [ ] Change a phone number by hand, refresh: your number stays
- [ ] "Force refresh all" shows the call count before running and progress while running
- [ ] Stop the worker during a refresh-all, restart it: it resumes

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

**You check**

- [ ] "Pizza, open now, within 5 km" returns the right restaurants
- [ ] Same search at a time when they're closed: they drop out
- [ ] Switch the radius center to another city: results follow
- [ ] With ~500 places, results feel instant

**Automated**

- Unit: filter Schema round-trips; open-now / tonight around midnight and across time zones
- Integration: radius + text against fixtures; open filter accepted; 1,000-place radius under 1s

---

## Phase 6 — Takeout import

**Goal:** bring your ~500 saved places in, deciding what to keep before spending API calls.

**Build** (format reference: [takeout-format.md](takeout-format.md), fixtures in `test/fixtures/takeout/`)

- Upload a zip or folder; `import.parse` job fills the staging table with no API calls
- Triage screen: table + map, filters (source list, date saved, area, text), keep/skip per entry and in bulk, flags for already-in-library and cross-list duplicates, running count of kept entries and expected API calls, save and resume
- Unresolved entries (no location, `[0,0]`) shown as "needs location", never as a pin
- `import.commit` job: create kept places, recreate lists, match by CID / feature id / name + coordinates, enqueue enrichment
- "Needs review" queue for weak matches
- Re-import remembers skips and doesn't duplicate
- "Undo import" for a whole run, listing edited places for confirmation first

**You check**

- [ ] Import your **real** Takeout export
- [ ] Skip a whole old travel list in one action; the API-call count drops accordingly
- [ ] Commit; your Google lists appear as Placard lists
- [ ] Resolve a few "Needs review" entries
- [ ] Import the same export again: no duplicates, skips remembered
- [ ] Undo the import: the library goes back to how it was (edited places asked about)

**Automated**

- Unit: parser against every fixture file, including the CSV and URL quirks in [takeout-format.md](takeout-format.md)
- Property: re-importing is idempotent
- Integration: parse → triage → commit → undo against the database, with the fake Google Layer
- E2E: upload the fixture, skip a list, commit, check the lists

---

## Phase 7 — Photos

**Goal:** remember what you ate.

**Build**

- `Media` service: upload to the media volume, thumbnails with `sharp`, authenticated serving
- Dish gallery on restaurant cards with optional caption; general photos on any place
- Photos follow the place's soft delete and purge

**You check**

- [ ] From your phone, add two dish photos with captions to a restaurant
- [ ] They show on the card next time you open it
- [ ] Logged out, a photo URL doesn't load
- [ ] Deleting and purging the place removes its files from disk

**Automated**

- Integration: upload, thumbnail, auth check, purge removes files
- E2E: upload a dish photo and see it on the card

---

## Phase 8 — Decide module

**Goal:** "what should I eat tonight?" in one tap.

**Build**

- `restaurants.decide` as an in-repo module Layer that only uses the core services
- Pool: list, tag, current search results, or all restaurants
- Filters: open tonight, distance; optional avoid-recent
- Wheel / spinner reveal → result card; clear message when the pool is empty

**You check**

- [ ] Spin from your "Italian restaurants" list with "open tonight": only open places can win
- [ ] Turn on avoid-recent, spin twice: no immediate repeat
- [ ] Filter so nothing matches: you get a clear "nothing open" message

**Automated**

- Unit + property: picks are always inside the filtered pool; avoid-recent respected
- Time-based: open-tonight filter at fixed times
- Architecture check: the module imports nothing from core internals (lint rule or test)

---

## Phase 9 — MCP

**Goal:** talk to your library from an AI client.

**Build**

- Personal access tokens (create, list, revoke) in settings
- `/mcp` with Streamable HTTP, stateless
- Tools: `search_places`, `get_place`, `create_place`, `add_to_list`, `set_status`, `decide_restaurant`, with input schemas generated from Effect Schemas
- Module tool registration (Decide registers its own tool)
- Rate limit, audit log, env switch to disable MCP
- "Connect MCP" page with Cursor and Claude snippets

**You check**

- [ ] Connect Cursor to your instance with a token
- [ ] Ask "what pizza places are open near me?": correct answer from your library
- [ ] Ask it to add a place to a list: it appears in the UI
- [ ] Ask it to pick dinner: same rules as the wheel
- [ ] Revoke the token: the client is refused

**Automated**

- Contract: tools list and input schemas; each tool called through the MCP SDK client
- Integration: token auth, user isolation, revoked tokens rejected

---

## Phase 10 — Release hardening (v0.1)

**Goal:** someone else can install and trust it.

**Build**

- Export all data as JSON + GeoJSON (with media manifest)
- Install guide: Compose, `.env.example`, Google key setup (APIs to enable, quota cap), Coolify section, backup with `pg_dump` + media volume, upgrade notes
- PWA manifest, icons, mobile layout pass
- Published image on GHCR, tagged release, changelog

**You check**

- [ ] Fresh install on Coolify by following only the guide
- [ ] Run every step of the **Definition of done** in [mvp.md](mvp.md)
- [ ] Install Placard on your phone's home screen
- [ ] Back up, wipe, restore: everything comes back, including photos

**Automated**

- E2E: the full definition-of-done suite against the built image
- Integration: export contains every place, list, tag and media reference

---

## Working rules across phases

1. Each phase is one or more pull requests; every PR keeps CI green.
2. A phase is done when all its **You check** boxes are ticked on a real `docker compose up`, not only in tests.
3. Bugs found during a checkpoint get a failing test first, then the fix.
4. Scope changes go into [mvp.md](mvp.md) before code.
5. If a phase reveals a design problem, update the relevant doc (data model, stack) in the same PR.
