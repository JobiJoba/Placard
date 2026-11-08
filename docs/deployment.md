# Deployment overview

Placard is meant to feel like Immich-class self-hosting: **Docker Compose first**, then panels such as Coolify or Dokploy.

Step-by-step commands: [install.md](install.md). Google Places BYOK: [google-apis.md](google-apis.md).

## Recommended path

The interactive [installer](install.md#quick-install-recommended) is the quickest
way to create a fresh Compose instance on Linux, macOS, or Windows. Docker must
already be installed and running Linux containers. Both scripts use the same
release assets and generate secrets automatically; local-only access is the default.
Existing installs, upgrades, NAS panels, HTTPS, and reverse proxies remain managed
through Compose and the instructions below.


| Target | Status |
| --- | --- |
| Docker Compose + GHCR image | Primary |
| Coolify / Dokploy / similar | Same Compose file; map HTTPS to the `app` service on port **3000** |
| NAS / Unraid / CasaOS | Use the Compose file and persistent volumes |
| Reverse proxy (Caddy, Traefik, nginx) | Terminate TLS; forward to `PLACARD_PORT` (default 3000) |

**Aspire** (`aspire run`) is for **local development** of the monorepo. Self-hosters never need the Aspire CLI — use the published image and [install.md](install.md).

## What the Compose stack includes

- **`app`** — API + built web UI + MCP at `/mcp`
- **`worker`** — background jobs (import, enrichment)
- **`db`** — Postgres + PostGIS
- **Volumes** — database data, `media` (photos), `modules` (uploaded Marketplace zips)

Health: `$PUBLIC_URL/api/health`.

## Environment (high level)

| Variable | Required | Purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | yes | Database password |
| `BETTER_AUTH_SECRET` | yes | Session signing (`openssl rand -base64 32`) |
| `PUBLIC_URL` | yes | Exact public origin (auth and links) |
| `PLACARD_PORT` | no | Host port (default `3000`) |
| `GOOGLE_MAPS_API_KEY` | no | Places BYOK — or set in Settings |
| `MCP_ENABLED` | no | Default `true` |
| `PLACARD_IMAGE` | no | Override image tag |

Full comments live in `example.env` / `.env.example`.

## Nextcloud

Run Placard **beside** Nextcloud (bookmark or External site). A native Nextcloud PHP app is not required and not the v1 path.

## Modules on a deployed instance

Uploaded modules land on the **`modules` volume** (`PLACARD_MODULES_DIR`). Keep that volume across upgrades. See [creating-modules.md](creating-modules.md).

## Backup

Instance backup (database + media + modules volumes) is documented in [Backup and restore](backup-restore.md). Library **Export** in Settings is a per-user zip, not a full disaster-recovery backup.

## Upgrades

Follow [Upgrade](upgrade.md) for version pinning, Compose and Coolify updates,
verification, and recovery after a failed upgrade.
