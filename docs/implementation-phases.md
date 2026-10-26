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

- Better Auth: email + password, sessions in Postgres
- First signup becomes admin; signup then closes; admin invites or creates users
- Settings: Google API key (instance), km/miles per user
- Auth guard for every page and API route; a tagged `Unauthorized` error mapped at the edge

**You check**

- [ ] First signup on a fresh install is admin
- [ ] Second visitor cannot sign up without an invite
- [ ] Admin invites a second user; that user logs in and sees an empty, separate library
- [ ] Saving the Google key persists across restarts; a bad key shows a clear test-call error
- [ ] Switching to miles is remembered per user

**Automated**

- Integration: first-user-admin rule, invite flow, one user can't read another user's data
- E2E: sign up → log out → log in; admin invites a user

---

## Phase 2 — Places & manual add

**Goal:** the core object exists and you can add places three ways.

**Build**

- `Places` service + `GooglePlaces` service (live Layer + fake Layer with recorded fixtures)
- Add page:
  - Autocomplete with session tokens → preview → save
  - Google map picker: click a point of interest → preview card → add
  - Manual pin + name + type when there's no key
- Duplicate guard on Place ID: opens the existing card
- Card grid home and place detail page (basic fields, "Open in Google / Apple / Organic Maps")
- Minimal enrichment on save: name, address, coordinates, types

**You check**

- [ ] Add a restaurant by typing its name
- [ ] Add a park by clicking it on the map
- [ ] Remove the key, add a place by dropping a pin
- [ ] Add the same restaurant again: you land on its existing card
- [ ] "Open in Google Maps" opens the right place on your phone

**Automated**

- Unit: duplicate detection, Google response decoding with Schema
- Contract: `GooglePlaces` against recorded fixtures (autocomplete, details)
- Integration: create place stores a PostGIS point and owner
- E2E: autocomplete add flow with the fake Google Layer

---

## Phase 3 — Organize

**Goal:** places become your library, not just pins.

**Build**

- Status: want to go / been there
- Tags and lists: create, rename, delete, assign
- Edit fields and notes; manual values override fetched ones
- Multi-select in the grid: bulk tag, bulk add/remove list, bulk delete
- Soft delete with a "Recently deleted" view, restore, and a 30-day purge job

**You check**

- [ ] Create an "Italian restaurants" list and add three places to it
- [ ] Tag a place `date-night`, mark it "been there"
- [ ] Edit a place's name; it stays edited
- [ ] Bulk-delete two places, restore one from "Recently deleted"

**Automated**

- Unit: override rules
- Time-based (`TestClock`): purge happens after 30 days, not before
- Integration: bulk operations are atomic; deleting a list doesn't delete places
- E2E: create list → add places → bulk delete → restore

---

## Phase 4 — Enrichment

**Goal:** cards carry real, useful details from Google.

**Build**

- `Enrichment` service: fetch details (hours, phone, website, price level, rating, cuisine/types) into facts with source + `fetched_at`
- `enrich.place` job with retry/backoff on the worker
- Refresh button per place; "Force refresh all" in settings with the expected call count and a progress view
- Manual overrides survive a refresh
- Google attribution shown where required

**You check**

- [ ] A newly added restaurant shows its opening hours, phone and website within seconds
- [ ] Change a phone number by hand, refresh: your number stays
- [ ] "Force refresh all" shows the call count before running and progress while running
- [ ] Stop the worker during a refresh-all, restart it: it resumes

**Automated**

- Unit: mapping Google details → facts; override precedence
- Contract: details fixtures including missing fields
- Integration: job retries on a simulated rate-limit error, then succeeds

---

## Phase 5 — Search

**Goal:** find things in your library better than Google Maps Saved.

**Build**

- `Search` service with one filter Schema: text, type, open now / tonight, radius from you or a chosen point, tag, list, status
- PostGIS radius queries with a GiST index; full-text / trigram on name, notes, cuisine
- Open-now evaluation from stored hours and the place's UTC offset
- Library defaults to near you; city / all switch
- Map view of the filtered results; distances in km or miles

**You check**

- [ ] "Pizza, open now, within 5 km" returns the right restaurants
- [ ] Same search at a time when they're closed: they drop out
- [ ] Switch the radius center to another city: results follow
- [ ] With ~500 places, results feel instant

**Automated**

- Property: filter Schema round-trips; open-now is consistent around midnight and across time zones
- Time-based (`TestClock`): open now vs open tonight at fixed times
- Integration: radius and text queries against seeded PostGIS data; a performance check at 1,000 places

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
