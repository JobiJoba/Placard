# Tech stack

The stack choices for v0.1 ([mvp.md](mvp.md)). Change them here first, then in code.

## Summary

| Layer | Choice |
| --- | --- |
| Language | TypeScript |
| Backend foundation | **Effect 4** for all server-side code: services, errors, config, HTTP, retries, schemas |
| Frontend | **Vite + React** SPA (PWA later via `vite-plugin-pwa`) |
| HTTP API | **Effect `HttpApi`** on `@effect/platform-node` (typed contract, OpenAPI, typed client) |
| Database | **Postgres + PostGIS** |
| Data access | **Drizzle ORM** through its native Effect integration (`drizzle-orm/effect-postgres`) + migrations |
| Schemas / validation | **Effect Schema** (replaces zod) |
| Auth | **Better Auth** (email + password; OIDC later) — Phase 1 |
| UI | **Tailwind 4 + shadcn/ui** |
| Maps | **Google Maps JavaScript API** everywhere |
| Place data | **Google Places API (New)**, using the instance key (BYOK) |
| Background jobs | **Postgres-backed queue** (pg-boss), no Redis |
| Media | **Local filesystem volume** |
| MCP | Official MCP TypeScript SDK, Streamable HTTP at `/mcp` on the server |
| Local orchestration | **Aspire** TypeScript AppHost (`aspire run`) |
| Deploy | Docker Compose: `app`, `worker`, `db`; one image (self-hosters never need Aspire) |
| License | AGPL-3.0 |

## Why these choices hang together

- **SPA + Effect HttpApi.** Placard is a private logged-in app; server rendering buys nothing. The heavy UI (map picker, triage, wheel) is client-side. The API contract lives in `@placard/domain` and is shared by the server, the React typed client, OpenAPI, and later MCP.
- **One image, one origin.** The Node server serves `/api/*` and the built SPA (SPA fallback). The worker uses the same image with a different start command. Auth cookies stay same-origin.
- **Postgres does everything stateful**: data, geo queries (PostGIS), jobs (pg-boss), and auth sessions. Backups come down to one database plus one media folder.
- **Aspire for developers, Compose for self-hosters.** `aspire run` starts PostGIS, server, worker, and Vite with a dashboard and OTEL. The committed `compose.yaml` is what Coolify / NAS users run.
- **Google everywhere for maps.** Clicking a point of interest on a Google map gives a Place ID directly. The same key powers autocomplete, details, and Takeout matching.

## Architecture

```
Browser / PWA ──┐
                ├──► Vite SPA ──(proxy /api)──► Effect HttpApi server ──► Postgres + PostGIS
MCP client  ────┘     apps/web                    apps/server (/api, /mcp)         ▲
                                                         │ enqueue jobs              │
                                                         ▼                           │
                                                   worker (pg-boss) ─────────────────┘
                                                         │
                                                         ▼
                                                 Google Places API
```

Rules:

1. **Core services are Effect services** (`Places`, `Lists`, `Search`, `Enrichment`, `Import`, `Media`), each defined as a service tag with a live Layer. HttpApi handlers, MCP tools, and modules all call these services. None of them talk to the database directly.
2. **Modules** (e.g. `restaurants.decide`) live in-repo under their own folder and depend only on the core services' public interfaces ([architecture-modules.md](architecture-modules.md)). In Effect terms, a module is a Layer that requires core services and provides its own.
3. **The Node runtime only.** No edge runtime, because PostGIS, the filesystem, and pg-boss need Node.

## How Effect is used

| Concern | Effect approach |
| --- | --- |
| Services and wiring | Service tags + Layers. `AppLayer` / `withConfig` compose everything; server and worker each provide the layer at startup. |
| Errors | Tagged errors (`PlaceNotFound`, `GoogleQuotaExceeded`, `TakeoutParseError`, …) in the error channel, mapped to HTTP status / MCP errors at the edge. No thrown exceptions in core. |
| Config | Effect `Config` for env vars (database URL, secrets, Google key fallback, MCP toggle). Invalid config fails at startup with a clear message. |
| Schemas | Effect Schema for domain types, API inputs, Takeout parsing, Google responses, and the search filter object. One schema per concept, reused by UI, API and MCP. |
| HTTP API | `HttpApi` definitions in `@placard/domain`; handlers via `HttpApiBuilder`; SPA files via `HttpStaticServer`. |
| Google client | Effect `HttpClient` with `Schedule` for retry/backoff, and rate limiting for batch enrichment. |
| Database | Drizzle via `drizzle-orm/effect-postgres`; queries return Effects; transactions are scoped. |
| Jobs | pg-boss wrapped in a `JobQueue` service; job handlers are Effects run on the worker runtime. |
| Observability | Effect spans + `OtlpTracer.layerFromConfig` when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (Aspire sets it). |
| UI | React stays React. The typed `HttpApiClient` calls the API; Effect is not pushed into every component. |

For MCP: start with the official MCP SDK, feeding it JSON Schema generated from our Effect Schemas. If Effect's own MCP server support fits by then, switching should only touch the MCP folder.

## Key technical decisions

### Search

- Store places with a PostGIS `geography(Point)` column plus a GiST index, so "within N km" is an indexed query.
- Do text search with Postgres full-text search or trigram matching on name, notes, and cuisine. No external search engine for v0.1.
- Compute **open now / tonight** locally from the stored opening hours and the place's UTC offset. That means no API call per search.
- The search input is a typed filter object (an Effect Schema) shared by the UI, the API, and MCP.

### Google APIs used

| Need | API |
| --- | --- |
| Map rendering + point-of-interest clicks | Maps JavaScript API |
| Autocomplete on the Add page | Places API (New) Autocomplete, with session tokens to keep costs down |
| Details on save / refresh | Places API (New) Place Details, requesting only the fields we store |
| Takeout matching | Text Search or Place Details from coordinates / name / CID |

**One key** for both the browser and server calls, stored in instance settings with an env var fallback. This keeps setup simple. Because the key is exposed to the browser, the install guide should recommend limiting it to the Maps JavaScript and Places APIs and setting a daily quota cap in Google Cloud.

### Background jobs

pg-boss jobs:

- `import.parse`: read the Takeout files into a staging table (`import_entries`) with no API calls. Triage edits happen on this table.
- `import.commit`: create places for kept entries, match them to Place IDs, and enqueue detail fetches. Resumable, and reports progress.
- `enrich.place`: fetch details for one place, with retry and backoff.
- `enrich.refreshAll`: fan out `enrich.place` jobs with rate limiting.

The UI polls job progress (Server-Sent Events can come later).

### Media

- Files go under `/data/media/{owner}/{place}/...` on a Docker volume.
- Thumbnails are generated on upload with `sharp`.
- Files are served through an authenticated route, never as public static files.

### MCP

- A `/mcp` route on `apps/server` with the SDK's Streamable HTTP transport, run statelessly.
- Auth uses a bearer personal access token, hashed in the database and mapped to a user.
- Tools are thin wrappers over core services, and modules register their own tools.

### Auth

- Better Auth with email + password and database sessions in Postgres, mounted as a raw route at `/api/auth/*` on the Effect router. It uses the Drizzle adapter on its own small `pg` pool; its tables are in the same Drizzle schema and migrations.
- First signup becomes admin, and after that signup is invite-only. A Better Auth `user.create.before` hook calls the Effect `SignupGate` service, which either claims the first-admin slot atomically or consumes an invite for that email.
- App endpoints are guarded by HttpApi middleware (`Authentication`, `AdminAuthentication`) that resolves the session cookie to a `CurrentUser`.
- Better Auth only accepts requests whose `Origin` matches `PUBLIC_URL`. Under Aspire, `PUBLIC_URL` is the Vite URL, because the browser talks to Vite and Vite proxies `/api`.
- Personal access tokens for MCP are a separate table.

### PWA

A web manifest, icons, and a responsive layout. Only a minimal service worker for installability; no offline caching. Added with `vite-plugin-pwa` in a later phase.

## Pinned versions (Phase 0)

| Package | Version | Why pinned |
| --- | --- | --- |
| `effect`, `@effect/*` | 4.0.6 | Effect 4 |
| `drizzle-orm`, `drizzle-kit` | 1.0.0-rc.5 | The Effect 4 integration (`drizzle-orm/effect-postgres`) only exists in the 1.0 line |
| `typescript` | 6.0.3 | Same major across the monorepo |
| `vite` | 7.x | SPA bundler |
| `better-auth` | 1.7.13 | Auth; server and React client must match |
| Aspire CLI / SDK | 13.6.x | TypeScript AppHost GA |
| Postgres image | `imresamu/postgis:18-3.6` | Multi-arch (amd64 + arm64); the official `postgis/postgis` image is amd64-only |

Server code runs directly with Node's built-in type stripping (no build step for the server or worker). Relative imports therefore use `.ts` extensions, and only erasable TypeScript syntax is allowed (`erasableSyntaxOnly`).

## Repo layout

```
placard/
  aspire-apphost/      # TypeScript AppHost (aspire run / publish)
  packages/
    domain/            # Effect Schemas + HttpApi contract (shared by server + web)
  apps/
    server/            # Effect HttpApi server, worker, drizzle, unit/integration tests
      src/
        config.ts
        health.ts
        runtime.ts
        main.ts        # HTTP server + SPA static + migrations
        worker.ts
        http/          # HttpApi handlers
        db/
        observability.ts
      drizzle/
      test/
    web/               # Vite React SPA (Tailwind + shadcn)
  test/
    fixtures/          # Takeout corpus
    e2e/               # Playwright
  Dockerfile, compose.yaml, .env.example, aspire.config.json
  docs/
```

Unit tests live next to the code they test (`apps/server/src/**/*.test.ts`).

## Tooling

| Area | Choice |
| --- | --- |
| Code hosting | **GitHub, public from day one** |
| Package manager | pnpm workspaces |
| Node | Current LTS (Vitest 5 needs Node 22.12+, 24, or 26+) |
| Lint / format | **Biome** |
| Local orchestration | **Aspire** (`aspire run`) |
| Tests | Vitest + `@effect/vitest`; Testcontainers for Postgres; Playwright for end-to-end. See [Testing](#testing). |
| Validation | Effect Schema |
| CI | GitHub Actions: lint, typecheck, test, compose markers, build image |
| Image registry | GHCR |

## Testing

Tests are a first-class deliverable, not cleanup work. A feature isn't done until its tests are in and CI is green.

### Layers of tests

| Level | What it covers | How |
| --- | --- | --- |
| **Unit** | Pure logic: opening-hours evaluation, distance and unit conversion, Takeout parsing, dedupe, search filter building, Decide pool selection and avoid-recent | `@effect/vitest` (`it.effect`). Services swapped for test Layers. |
| **Property** | Invariants that examples miss: filters round-trip through their schema, open-now is consistent across time zones and midnight, dedupe is idempotent | `it.prop` with Arbitraries derived from Effect Schemas |
| **Time-dependent** | "Open now / tonight", soft-delete 30-day purge, avoid-recent windows | `TestClock`, so tests control time instead of depending on it |
| **Integration** | Real SQL: PostGIS radius queries, full-text search, migrations, transactions, import staging → commit, job handlers | Postgres + PostGIS in Testcontainers, shared per suite with `it.layer` |
| **Contract** | Google Places client against recorded responses; MCP tools list and call schemas; HTTP API matches its OpenAPI | Recorded fixtures; `HttpApiTest`; MCP calls through the SDK client |
| **End-to-end** | The definition-of-done flows from [mvp.md](mvp.md): sign up, triage + import, add place, search, decide, bulk delete, export | Playwright against `docker compose`, with a fake Google layer enabled by a test-only flag |

### Rules

1. **Google is never called in CI.** A `GooglePlaces` service has a live Layer and a fake Layer backed by recorded fixtures. A manual, opt-in script can re-record fixtures with a real key.
2. **Takeout fixture corpus.** Start from [`test/fixtures/takeout/`](../test/fixtures/takeout/) (anonymized sample from a real export). Format notes: [takeout-format.md](takeout-format.md). Every parser bug found becomes a new fixture. Raw personal exports stay gitignored under `Takeout/`.
3. **Every bug fix ships with a failing test first.**
4. **Coverage target**: high coverage on core, modules and MCP (aim for 90%+ lines), measured in CI. UI coverage comes from end-to-end tests rather than a number.
5. **CI gates on every PR**: Biome, typecheck, unit + property, integration, then end-to-end on the main branch and release tags.
6. **Test Layers are part of the codebase**, next to the live Layers, so every service is easy to fake.

## Product-level settings

| Setting | Choice |
| --- | --- |
| UI language | **English only** for v0.1, with strings kept in one place so i18n can be added later |
| Distance units | **km / miles setting** per user from day one; store metres internally |
