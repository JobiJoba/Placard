# Placard

**Your places. On your cards. On your server.**

Placard is a self-hosted place library: collect, organize, and enrich places you care about — then **act on them** with Marketplace modules (e.g. a pick / spin wheel) and **MCP** (Cursor, Claude, …).

Think Immich, but for starred places: private to your instance, Docker-friendly, extensible.

Preparing **v1.0.0**. [Release readiness](docs/release-1.0.md) tracks the remaining
real-device and deployment checks. [Current state](docs/current-state.md) records
what is implemented and tested. AGPL-3.0 licensed.

**[Documentation](docs/README.md) · [User guide](docs/user-guide.md) · [Contributing](CONTRIBUTING.md)**

## Install (Docker Compose — recommended)

Install Docker first, then run the interactive installer. It generates secrets and
starts the published app, worker, and database. No local build is needed.

**Linux / macOS:**

```sh
bash <(curl -fsSL https://github.com/JobiJoba/Placard/releases/latest/download/install.sh)
```

**Windows PowerShell:**

```powershell
& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing https://github.com/JobiJoba/Placard/releases/latest/download/install.ps1).Content))
```

The default is local-only access at `http://localhost:3000`. Enter a public domain
at the HTTPS prompt to enable automatic certificates and HTTP redirects with Caddy.
Complete administrator signup before exposing your instance. See **[the installation guide](docs/install.md)**
for Docker prerequisites, download-and-inspect instructions, automated options,
manual Compose setup, upgrades, and backup. Installer links require a release that
includes the new installer assets.

Nightly / tip-of-`main` install lives in a collapsed section of **[docs/install.md](docs/install.md)**. Google Maps Platform BYOK: **[docs/google-apis.md](docs/google-apis.md)**. The marketing site serves the same pages under `/docs`.

## Develop

Requires Node 24+, pnpm 12, Docker, and the [Aspire CLI](https://aspire.dev/get-started/install-cli/).

```sh
pnpm install
aspire run                  # PostGIS + server + worker + Vite (dashboard URL in the terminal)
# App: https://<LAN-IP>:5173 (see the web endpoint in the Aspire dashboard)
```

Aspire exposes the frontend on port 5173 for phone testing on the same LAN and uses that endpoint for authentication. It detects a physical network interface automatically; set `PLACARD_DEV_HOST=192.168.1.10` before `aspire run` to select a specific address, or `PLACARD_DEV_HOST=localhost` for the localhost auth URL. The HTTPS development certificate must be trusted by the phone and valid for the address you use; the default localhost certificate can produce a certificate warning on the LAN address.

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
| `pnpm check:recovery` | Build a disposable Compose stack and verify backup → wipe → restore |

## Why this exists

Cloud map apps are great at discovery and navigation. They are poor at *ownership*, *search over your saves*, and *household decisions*:

- Starred places live on someone else’s platform
- “Pizza, open, within 5 km, from *my* list” is painful in Google Maps Saved
- Your dish photos and notes don’t travel with you

Placard: **import → enrich → search/browse cards → run modules** — and talk to it via **MCP**.

## Documentation

Start with the [documentation index](docs/README.md). It separates using Placard,
operating an instance, and extending the product.

| You want to… | Read |
| --- | --- |
| Understand the product | [Overview](docs/product-overview.md) |
| Run your own instance | [Install](docs/install.md) |
| Back up or recover an instance | [Backup and restore](docs/backup-restore.md) |
| Upgrade an existing instance | [Upgrade](docs/upgrade.md) |
| Import and organize places | [User guide](docs/user-guide.md) |
| Configure enrichment | [Google APIs](docs/google-apis.md) |
| Diagnose a problem | [Troubleshooting](docs/troubleshooting.md) |
| Connect an agent | [MCP](docs/mcp.md) |
| Build a module | [Module authoring](docs/creating-modules.md) |
| Contribute code | [Contributing](CONTRIBUTING.md) |
| Follow v1.0.0 readiness | [Release gates](docs/release-1.0.md) |

## Snapshot of decisions

- **Import + browse + library search** are the top jobs; dinner spin is a Marketplace module (not bundled)
- ~500 places, near-me daily, multi-city library OK
- **PWA** installable (manifest + icons); multi-user accounts ship now; **household place sharing is admin-gated** (dinner vote and shared lists still later)
- Google Takeout must; instance Google key; force refresh, no auto mass cron
- Want / been-there first-class; visit history optional & separate from dishes
- **MCP ships**; trusted Marketplace plugins (zip upload + GitHub Release); AGPL-3.0
- Stack: Vite React + Effect HttpApi + Aspire (dev) + Compose (deploy)

## Positioning

Feels at home next to Immich / Paperless / Jellyfin: Compose up, data on your disk.

Not a turn-by-turn navigator. Not a public map. Placard owns the **library, the cards, the search, and the modules**.
