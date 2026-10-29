# Placard

**Your places. On your cards. On your server.**

Placard is a self-hosted place library: collect, organize, and enrich places you care about — then **act on them** with modules (restaurants first: Decide / wheel) and **MCP** (Cursor, Claude, …).

Think Immich, but for starred places: private to your instance, Docker-friendly, extensible.

> **Status:** Phases **0–10 code-complete** (export, PWA, install guide, GHCR workflow). Founder Coolify / phone install checks remain. See [docs/current-state.md](docs/current-state.md).  
> **Site:** Marketing landing in [`apps/site`](apps/site) (GitHub Pages).  
> **License:** AGPL-3.0 (like Immich).

## Install (Docker Compose — recommended)

No local build. Download release install files, set env, start Compose:

```sh
mkdir ./placard-app && cd ./placard-app
curl -fsSL -o docker-compose.yml \
  https://github.com/JobiJoba/Placard/releases/latest/download/docker-compose.yml
curl -fsSL -o example.env \
  https://github.com/JobiJoba/Placard/releases/latest/download/example.env
cp example.env .env
# Edit .env: POSTGRES_PASSWORD, BETTER_AUTH_SECRET (openssl rand -base64 32), PUBLIC_URL
docker compose up -d
```

Open http://localhost:3000 (or your `PUBLIC_URL`). Health: `/api/health`.

Release compose pins a stable image tag. Until the first `v*` release exists, use the [main fallback](docs/install.md#step-1--download-the-required-files) (`compose.ghcr.yaml` + `:nightly`).

Full guide (Coolify, Dokploy, backup, upgrade, build-from-source): **[docs/install.md](docs/install.md)**. Google Maps Platform BYOK: **[docs/google-apis.md](docs/google-apis.md)**. The marketing site serves the same pages under `/docs`.

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
| [docs/current-state.md](docs/current-state.md) | **Idea vs shipped** — start here for progress |
| [docs/vision.md](docs/vision.md) | Problem, thesis, modules ambition |
| [docs/mvp.md](docs/mvp.md) | **v0.1 scope freeze** (what ships, what doesn't) |
| [docs/implementation-phases.md](docs/implementation-phases.md) | Build plan + phase status |
| [docs/tech-stack.md](docs/tech-stack.md) | Stack, architecture, repo layout |
| [docs/takeout-format.md](docs/takeout-format.md) | Real Takeout shapes + matching notes |
| [test/fixtures/takeout/](test/fixtures/takeout/) | Anonymized sample export for tests |
| [docs/decisions.md](docs/decisions.md) | Resolved product choices |
| [docs/first-user.md](docs/first-user.md) | Founder priorities & scale |
| [docs/product-overview.md](docs/product-overview.md) | Objects, modes, flows |
| [docs/modules-restaurants.md](docs/modules-restaurants.md) | Decide / vote / dish memories |
| [docs/architecture-modules.md](docs/architecture-modules.md) | Core vs modules; trusted plugins |
| [docs/creating-modules.md](docs/creating-modules.md) | **How to build a module** (step-by-step + Pick example) |
| [docs/mcp.md](docs/mcp.md) | Agent access (must-ship, implemented) |
| [docs/install.md](docs/install.md) | **Install / Coolify / Dokploy / backup / upgrade** |
| [docs/google-apis.md](docs/google-apis.md) | **Google Maps Platform BYOK** |
| [docs/mcp.md](docs/mcp.md) | **Connect MCP clients** |
| [docs/creating-modules.md](docs/creating-modules.md) | **Marketplace modules (zip upload)** |
| [docs/module-brief-for-ai.md](docs/module-brief-for-ai.md) | **Copy-paste brief for AI module authors** |
| [packages/modules/skeleton](packages/modules/skeleton) | **Minimal module skeleton (`example.skeleton`)** |
| [docs/deployment.md](docs/deployment.md) | Docker targets, Coolify notes, Nextcloud adjacency |
| [docs/feasibility.md](docs/feasibility.md) | Takeout, Google BYOK, what’s realistic |
| [docs/competitors.md](docs/competitors.md) | Adjacent landscape |
| [docs/naming.md](docs/naming.md) | Name decision |

## Snapshot of decisions

- **Import + browse + library search** are the top jobs; dinner spin is a flagship module
- ~500 places, near-me daily, multi-city library OK
- **PWA** installable (manifest + icons); multi-user accounts ship now; **household sharing is v0.2**
- Google Takeout must; instance Google key; force refresh, no auto mass cron
- Want / been-there first-class; visit history optional & separate from dishes
- **MCP ships**; trusted Marketplace plugins (Decide bundled; zip upload); AGPL-3.0
- Stack: Vite React + Effect HttpApi + Aspire (dev) + Compose (deploy)

## Positioning

Feels at home next to Immich / Paperless / Jellyfin: Compose up, data on your disk.

Not a turn-by-turn navigator. Not a public map. Placard owns the **library, the cards, the search, and the modules**.
