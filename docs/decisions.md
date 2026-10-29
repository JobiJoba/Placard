# Product decisions

Resolved choices from product discussion. Update this file when something changes.

## Identity & legal

| Topic | Decision |
| --- | --- |
| **Name** | **Placard** (place + card). Repo folder renamed from `MyMaps`. |
| **License** | **AGPL-3.0**, same family as Immich (copyleft for network/self-hosted software). Optional paid “support license” later is *not* required for use — Immich’s dual commercial keys are a separate product choice we are **not** committing to. |

## Privacy, users, household

| Topic | Decision |
| --- | --- |
| **Privacy** | Private to the instance only. No public share pages. |
| **Auth** | **Multi-user accounts from day one** (not “single password forever”). Solo use still feels simple; accounts are there when needed. |
| **Single user vs household** | Solo is the default chrome. Household features unlock when a household is set up. |
| **Household library** | **Both** shared and private: members can keep private places; household can also share lists/places. |
| **Invites** | **Admin only** can invite/remove members. |
| **Votes** | **In-app only** for now (no guest couch links). |
| **Kids / guests** | **No** lightweight guest or kid accounts. Full members only. |

## Primary product jobs (first-user)

| Topic | Decision |
| --- | --- |
| **Priority habits** | 1) **Import + browse** 2) **Search / filter the library** (better than Google Maps saved search) 3) **Spin / decide for dinner** 4) Dish photos (nice, optional timing) |
| **Scale** | Designed for ~**500+** places comfortably (first user has ~500). |
| **Geography** | Multi-city OK (travel history), but **everyday UX defaults to “near me”** / local city. |
| **Search ambition** | Structured filters (open now, radius, cuisine/type, tags, lists) first. **Optional local LLM** later to turn natural language (“pizza open within 5 km”) into those filters — not a blocker for MVP. |

## Capture & clients

| Topic | Decision |
| --- | --- |
| **Mobile** | **PWA first**. Native app possible later (founder has mobile experience) but not required for v1; maintenance cost acknowledged. |
| **Dish photos** | Supported; user may upload immediately or later — both flows OK. No forced post-meal ritual. |
| **Offline** | **No offline mode** for now (online at home / on network is fine). |
| **Install count** | **One install forever** (single instance mental model). |

## Data & enrichment

| Topic | Decision |
| --- | --- |
| **Google Takeout** | **Must-have** on-ramp. If formats break, we fix the importer. Import has a **free triage step** (keep/skip using Takeout data only) before any Places API call. |
| **Removing places** | Always possible after import: single delete, bulk delete, and "undo import". Soft delete with a 30-day restore window. |
| **Manual add** | Equally **first-class**: an "Add place" page with Google Places **autocomplete**, a **map picker** (click a point of interest to add it), and a manual pin fallback when there's no key. |
| **Google API key** | **Per instance** by default; **optional per-member override** is desirable. |
| **Google dependency** | Accepted for enrichment quality; Takeout + manual remain fallbacks. |
| **Refresh policy** | **No automatic mass refresh cron** by default. Provide an explicit **Force refresh** (re-fetch details for places). |
| **OSM** | Optional/fallback, not primary. |
| **Place status** | **First-class**: at least **want to go** vs **been there** (visited). |
| **Visit history** | **Separate from dish photos**, and **optional** (e.g. mark visited / dates without requiring dish uploads). |

## Modules, MCP, deploy

| Topic | Decision |
| --- | --- |
| **Modules** | Trusted same-process plugins; SDK + instance install + per-user show; marketplace catalog UI + admin zip upload (**shipped** ahead of original “Later”). Restaurants first. |
| **Decide wheel** | Reference plugin `@placard/module-restaurants-decide`; optional **“avoid recent picks”** toggle. |
| **MCP** | **Must-ship** — Streamable HTTP `/mcp` + PATs (**shipped**). |
| **Install targets** | Docker Compose / Coolify first; beside Nextcloud, not inside it (v1). |
| **Backups** | Aim for **one-click backup** (DB + media), Immich-like niceness — not only raw volume docs. |

## Stack (revised after Phase 0)

| Topic | Decision |
| --- | --- |
| **Frontend** | **Vite + React SPA**, not Next.js. Private app behind login; no SSR/SEO need. |
| **Backend HTTP** | **Effect `HttpApi`** on `@effect/platform-node`. NestJS dropped (DI overlaps Effect Layers; decorators clash with Node type stripping). Hono skipped as redundant with HttpApi. |
| **Production topology** | One app image: server serves `/api` + built SPA (same origin). Worker = same image, different command. |
| **Local orchestration** | **Aspire** TypeScript AppHost (`aspire run`) for PostGIS + server + worker + Vite + dashboard/OTEL. |
| **Self-host deploy** | Committed hand-maintained `compose.yaml` for Coolify/NAS. Aspire publish is optional (`PLACARD_COMPOSE_FROM_ASPIRE=1`); self-hosters never need the Aspire CLI. |
| **Monorepo** | pnpm workspaces: `apps/server`, `apps/web`, `packages/domain`, `aspire-apphost`. |

## Implications

1. Search + near-me + open/cuisine filters are core product, not a module afterthought.
2. Import UX must be excellent (~500 places on day one).
3. Household privacy model needs place/list visibility (private vs household-shared).
4. Local LLM search is a later enhancer on top of real filters — design filters so an LLM can drive them.
5. MCP ships in the same release train as a usable library, not as a forever backlog item.
6. AGPL-3.0 LICENSE file belongs in the repo when code starts (or immediately as intent).
