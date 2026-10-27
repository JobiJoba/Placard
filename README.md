# Placard

**Your places. On your cards. On your server.**

Placard is a planned self-hosted app for collecting, organizing, and enriching places you care about — then **acting on them** with modules (restaurants first: decide what to eat, household votes, dish photo memories).

Think Immich, but for starred places: private to you or your household, Docker-friendly, extensible, **MCP-ready**.

> **Status:** Phase 0 (foundations) of [the build plan](docs/implementation-phases.md). The app runs, but there are no features yet.  
> **License:** AGPL-3.0 (like Immich).

## Run it (self-host)

```sh
cp .env.example .env        # set POSTGRES_PASSWORD and BETTER_AUTH_SECRET
docker compose up -d --build
```

Open http://localhost:3000. `http://localhost:3000/api/health` reports database status.

## Develop

Requires Node 24+, pnpm 12, Docker, and the [Aspire CLI](https://aspire.dev/get-started/install-cli/).

```sh
pnpm install
aspire run                  # PostGIS + server + worker + Vite (dashboard URL in the terminal)
# App: https://localhost:5173  (fixed HTTPS port; trust the Aspire/dev certificate if prompted)
```

Aspire installs the AppHost with `pnpm install --ignore-workspace`, which skips this repo's `allowBuilds` for `esbuild`. If you hit `ERR_PNPM_IGNORED_BUILDS`, set `strictDepBuilds: false` in `~/Library/Preferences/pnpm/config.yaml` (macOS) or `$XDG_CONFIG_HOME/pnpm/config.yaml`.

Or without Aspire (Compose db + manual processes):

```sh
docker compose up -d db     # add ports: ["5432:5432"] via compose.override.yaml for host access
export DATABASE_URL=postgres://placard:change-me@localhost:5432/placard
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
export PUBLIC_URL=https://localhost:5173  # the Vite URL you open in the browser (HTTP also fine for plain `vite`)
pnpm db:migrate
pnpm --filter @placard/server start
pnpm --filter @placard/web dev
pnpm worker
```

| Command | What it does |
| --- | --- |
| `aspire run` / `pnpm dev` | Local stack via Aspire |
| `pnpm lint` / `pnpm format` | Biome check / fix |
| `pnpm typecheck` | TypeScript across packages |
| `pnpm test:unit` | Unit tests (`@effect/vitest`) |
| `pnpm test:integration` | Integration tests against a PostGIS container (Testcontainers) |
| `pnpm test:e2e` | Playwright; set `PLAYWRIGHT_BASE_URL` to test a running stack |
| `pnpm db:generate` | Generate a migration from `apps/server/src/db/schema.ts` |
| `pnpm compose:generate` | Validate committed `compose.yaml` markers |

## Why this exists

Cloud map apps are great at discovery and navigation. They are poor at *ownership*, *search over your saves*, and *household decisions*:

- Starred places live on someone else’s platform
- “Pizza, open, within 5 km, from *my* list” is painful in Google Maps Saved
- Your dish photos and notes don’t travel with you

Placard: **import → enrich → search/browse cards → run modules** — and talk to it via **MCP**.

## Documentation

| Doc | What it covers |
| --- | --- |
| [docs/vision.md](docs/vision.md) | Problem, thesis, modules ambition |
| [docs/mvp.md](docs/mvp.md) | **v0.1 scope freeze** (what ships, what doesn't) |
| [docs/implementation-phases.md](docs/implementation-phases.md) | Build plan: phases with checkpoints to test |
| [docs/tech-stack.md](docs/tech-stack.md) | Stack, architecture, repo layout |
| [docs/takeout-format.md](docs/takeout-format.md) | Real Takeout shapes + matching notes |
| [test/fixtures/takeout/](test/fixtures/takeout/) | Anonymized sample export for tests |
| [docs/decisions.md](docs/decisions.md) | Resolved product choices |
| [docs/first-user.md](docs/first-user.md) | Founder priorities & scale |
| [docs/product-overview.md](docs/product-overview.md) | Objects, modes, flows, MVP sketch |
| [docs/modules-restaurants.md](docs/modules-restaurants.md) | Decide / vote / dish memories |
| [docs/architecture-modules.md](docs/architecture-modules.md) | Core vs modules; third-party future |
| [docs/mcp.md](docs/mcp.md) | Agent access (must-ship) |
| [docs/deployment.md](docs/deployment.md) | Docker, Coolify, Nextcloud adjacency |
| [docs/feasibility.md](docs/feasibility.md) | Takeout, Google BYOK, what’s realistic |
| [docs/competitors.md](docs/competitors.md) | Adjacent landscape |
| [docs/naming.md](docs/naming.md) | Name decision |

## Snapshot of decisions

- **Import + browse + library search** are the top jobs; dinner spin is a flagship module
- ~500 places, near-me daily, multi-city library OK
- **PWA first**; multi-user accounts from day one; household = shared + private
- Google Takeout must; instance Google key (+ optional per-member override); force refresh, no auto mass cron
- Want / been-there first-class; visit history optional & separate from dishes
- **MCP must-ship**; in-repo modules first; AGPL-3.0; one-click backup aimed for
- Stack: Vite React + Effect HttpApi + Aspire (dev) + Compose (deploy)

## Positioning

Feels at home next to Immich / Paperless / Jellyfin: Compose up, data on your disk.

Not a turn-by-turn navigator. Not a public map. Placard owns the **library, the cards, the search, and the modules**.
