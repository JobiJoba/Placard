# Install Placard — Docker Compose

Docker Compose is the **recommended** way to run Placard. You pull a published image from GHCR; you do not build from source.

Architecture notes: [deployment.md](deployment.md).

**On this page**

1. [Requirements](#requirements)
2. [Step 1 — Download](#step-1--download-the-required-files)
3. [Step 2 — `.env`](#step-2--populate-the-env-file)
4. [Step 3 — Start](#step-3--start-the-containers)
5. [Image tags](#image-tags)
6. [Coolify](#coolify)
7. [Dokploy](#dokploy)
8. [Backup](#backup)
9. [Build from source](#build-from-source-contributors)
10. [Library export & MCP](#library-export--mcp)

Google Maps Platform setup (API key, restrictions, smoke-check) lives in **[google-apis.md](google-apis.md)**.

## Requirements

- Docker Engine + Compose v2
- ~1 GB RAM free for app + PostGIS
- Optional but recommended for a full install: Google Maps Platform key — see [google-apis.md](google-apis.md)

CRUD, Takeout triage, OSM pin-drop, and MCP work **without** a Google key. The key unlocks autocomplete, Google map picking, enrichment (hours, phone, cover photos), and confident Takeout matching.

---

## Step 1 — Download the required files

Create a directory for Placard (for example `./placard-app`):

```sh
mkdir ./placard-app
cd ./placard-app
```

Download `docker-compose.yml` and `example.env` from the **latest GitHub Release** (pins a stable semver image):

```sh
curl -fsSL -o docker-compose.yml \
  https://github.com/JobiJoba/Placard/releases/latest/download/docker-compose.yml
curl -fsSL -o example.env \
  https://github.com/JobiJoba/Placard/releases/latest/download/example.env
```

You can also grab those two files in the browser from the [latest release](https://github.com/JobiJoba/Placard/releases/latest).

<details>
<summary>Nightly / tip of <code>main</code> (experimental)</summary>

Use this only if you want CI tip-of-`main` builds. The compose file defaults to the **`:nightly`** image and can change without a semver bump.

```sh
curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/JobiJoba/Placard/main/compose.ghcr.yaml
curl -fsSL -o example.env \
  https://raw.githubusercontent.com/JobiJoba/Placard/main/.env.example
```

See [Image tags](#image-tags).

</details>

---

## Step 2 — Populate the `.env` file

```sh
cp example.env .env
```

Edit `.env` and set at least:

| Variable | Notes |
| --- | --- |
| `POSTGRES_PASSWORD` | Database password (use letters and digits; avoid special chars that confuse Compose) |
| `BETTER_AUTH_SECRET` | Session signing secret — `openssl rand -base64 32` |
| `PUBLIC_URL` | Exact URL users open (e.g. `https://placard.example.com` or `http://localhost:3000`) |

Optional:

- `PLACARD_PORT` — host port (default `3000`)
- `GOOGLE_MAPS_API_KEY` — or set later in Settings → Integrations (see [google-apis.md](google-apis.md))
- `PLACARD_IMAGE` — override the image (release compose already pins a version; set `ghcr.io/jobijoba/placard:nightly` only if you opt into nightlies)
- `MCP_ENABLED` — default `true`

If the GHCR package is private: `docker login ghcr.io` (GitHub PAT with `read:packages`).

---

## Step 3 — Start the containers

From the directory that contains `docker-compose.yml` and `.env`:

```sh
docker compose up -d
```

Open `$PUBLIC_URL`. Health: `$PUBLIC_URL/api/health`.

The first account to sign up becomes **admin**.

### Upgrade

```sh
# Re-download the latest release compose if needed, then pull + recreate
curl -fsSL -o docker-compose.yml \
  https://github.com/JobiJoba/Placard/releases/latest/download/docker-compose.yml
docker compose pull
docker compose up -d
```

Migrations run on boot. Keep named volumes so the library and photos survive. See [CHANGELOG.md](../CHANGELOG.md).

---

## Image tags

| Tag | Use |
| --- | --- |
| Semver (`0.1.0`, …) | **Production** — what release `docker-compose.yml` pins by default |
| `latest` | Latest **stable** release (moved only by `v*` tags, not nightlies) |
| `nightly` | Experimental — tip of `main` after CI (see collapsible above) |
| `nightly-<sha>` | Pin one nightly build |

---

## Coolify

1. New Resource → **Docker Compose**
2. Paste the release `docker-compose.yml` from the [latest release](https://github.com/JobiJoba/Placard/releases/latest)
3. Set env from `example.env` (`BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `PUBLIC_URL=https://your-domain`)
4. Map the domain to the **app** service on port **3000**
5. Deploy; wait for healthchecks on `app` and `db`

Volumes `media` and `modules` must persist. MCP is same-origin at `/mcp`.

<details>
<summary>Coolify with nightly compose</summary>

Paste repo [`compose.ghcr.yaml`](../compose.ghcr.yaml) instead of the release file, and set env from [`.env.example`](../.env.example).

</details>

## Dokploy

Same Compose stack as Coolify — create a **Docker Compose** service (not a single-image app).

1. Paste the release `docker-compose.yml` from the [latest release](https://github.com/JobiJoba/Placard/releases/latest)
2. Set env from `example.env` (`BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `PUBLIC_URL=https://your-domain`)
3. **Domains → Add Domain** → select the **app** service → container port **3000** (Dokploy/Traefik routes to that internal port; do not confuse this with host port publish)
4. Deploy; wait for healthchecks. HTTPS certs may take a few seconds after the first deploy

Volumes `media` and `modules` must persist. MCP is same-origin at `/mcp`.

<details>
<summary>Dokploy with nightly compose</summary>

Paste repo [`compose.ghcr.yaml`](../compose.ghcr.yaml) instead of the release file, and set env from [`.env.example`](../.env.example).

</details>

---

## Backup

Instance backup (database + files) — not Settings → Export library (per-user zip).

```sh
docker compose exec -T db pg_dump -U placard placard | gzip > placard-$(date +%Y%m%d).sql.gz

docker run --rm -v placard_pgdata:/data -v "$PWD":/backup alpine \
  tar czf /backup/pgdata.tgz -C /data .
docker run --rm -v placard_media:/data -v "$PWD":/backup alpine \
  tar czf /backup/media.tgz -C /data .
docker run --rm -v placard_modules:/data -v "$PWD":/backup alpine \
  tar czf /backup/modules.tgz -C /data .
```

### Restore

1. `docker compose stop app worker`
2. Restore Postgres dump or `pgdata` archive
3. Restore `media` / `modules` archives
4. `docker compose start app worker`

## Build from source (contributors)

For forks and local image builds, use the repo [`compose.yaml`](../compose.yaml):

```sh
git clone https://github.com/JobiJoba/Placard.git
cd Placard
cp .env.example .env
# Set POSTGRES_PASSWORD, BETTER_AUTH_SECRET, PUBLIC_URL
docker compose up -d --build
```

Day-to-day development: `aspire run` — see the [README](../README.md#develop).

## Library export & MCP

- **Export:** Settings → General → Export library (`GET /api/export`) — personal zip, not instance DR.
- **MCP:** Settings → MCP — create a PAT; endpoint `$PUBLIC_URL/mcp`. Details: [mcp.md](mcp.md).
