# Install Placard

Self-host Placard with Docker Compose (Coolify, VPS, NAS Docker UI). Architecture notes: [deployment.md](deployment.md).

## Requirements

- Docker Engine + Compose v2
- ~1 GB RAM free for app + PostGIS
- Optional: Google Maps Platform key (Places API New + Maps JavaScript API)

## Quick start (Compose)

```sh
git clone https://github.com/JobiJoba/Placard.git
cd Placard
cp .env.example .env
# Set POSTGRES_PASSWORD and BETTER_AUTH_SECRET (openssl rand -base64 32)
# Set PUBLIC_URL to the URL users will open (e.g. https://placard.example.com)
docker compose up -d --build
```

Open `$PUBLIC_URL`. Health: `$PUBLIC_URL/api/health`.

First visitor becomes **admin**. Set the Google key under Settings → Integrations (or `GOOGLE_MAPS_API_KEY` in `.env`).

### Published image (optional)

After a tagged release, you can skip building from source. In `compose.yaml`, point `app` / `worker` at:

```yaml
image: ghcr.io/jobijoba/placard:0.1.0
# remove or comment out: build: .
```

See [CHANGELOG.md](../CHANGELOG.md) for tags. Pull with Docker logged into GHCR if the package is private.

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | yes | Postgres user password |
| `BETTER_AUTH_SECRET` | yes | ≥32 chars; changing it signs everyone out |
| `PUBLIC_URL` | yes | Exact origin for cookies and invite links |
| `PLACARD_PORT` | no | Host port (default `3000`) |
| `GOOGLE_MAPS_API_KEY` | no | Or set in admin Settings |
| `MCP_ENABLED` | no | Default `true` |

Full template: [`.env.example`](../.env.example).

## Google APIs

Enable on the Google Cloud project:

1. **Places API (New)** — server autocomplete / details / enrichment  
2. **Maps JavaScript API** — browser map  

Restrict the key to those APIs and set a **daily quota cap**. Do **not** use HTTP-referrer-only restrictions: server calls send no referrer. Without a key, users can still drop pins on OpenStreetMap.

## Coolify

1. New Resource → **Docker Compose**
2. Point at this repo (or paste `compose.yaml`)
3. Set env from `.env.example` (`BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `PUBLIC_URL=https://your-domain`)
4. Map the domain to the **app** service on port **3000**
5. Deploy; wait for healthchecks on `app` and `db`

Volumes `media` and `modules` must persist across deploys. MCP is same-origin HTTPS at `/mcp` — no extra Coolify product required.

## Backup

Instance backup (database + files) — not the same as Settings → Export library (per-user zip).

```sh
# Database
docker compose exec -T db pg_dump -U placard placard | gzip > placard-$(date +%Y%m%d).sql.gz

# Named volumes (paths vary by Docker root; example with compose project "placard")
docker run --rm -v placard_pgdata:/data -v "$PWD":/backup alpine \
  tar czf /backup/pgdata.tgz -C /data .
docker run --rm -v placard_media:/data -v "$PWD":/backup alpine \
  tar czf /backup/media.tgz -C /data .
docker run --rm -v placard_modules:/data -v "$PWD":/backup alpine \
  tar czf /backup/modules.tgz -C /data .
```

### Restore

1. Stop app/worker: `docker compose stop app worker`
2. Restore Postgres (`gunzip -c ….sql.gz | docker compose exec -T db psql -U placard placard`) or restore the `pgdata` volume archive
3. Restore `media` / `modules` volume archives
4. `docker compose start app worker`

## Upgrade

1. Backup (above)
2. `git pull` (or pull a newer GHCR tag)
3. `docker compose up -d --build` (or `docker compose pull && docker compose up -d`)
4. App runs migrations on boot — keep volumes mounted so the library and photos survive

Pin `PLACARD_VERSION` / image tags in production; read [CHANGELOG.md](../CHANGELOG.md) before jumping majors.

## Library export

Signed-in users can download their places, lists, tags, and media from **Settings → General → Export library** (`GET /api/export`). That zip is for portability / personal backup; it does **not** replace `pg_dump` for full instance disaster recovery.

## MCP

Settings → MCP: create a PAT, paste snippets into Cursor/Claude. Endpoint: `$PUBLIC_URL/mcp`. Disable with `MCP_ENABLED=false`. Details: [mcp.md](mcp.md).
