# Deployment & install targets

Placard targets the self-hosted community: home server, VPS, NAS, Coolify, etc. You do **not** need a native Nextcloud app on day one to feel “installable” next to Immich-like projects — you need a **boring, excellent Docker story**.

**Install walkthrough:** [install.md](install.md) (Compose quickstart, Coolify, Google APIs, backup, upgrade, GHCR `:0.1.0` / `:nightly`).

## Priority order

| Priority | Target | What “ready” means |
| --- | --- | --- |
| **P0** | Docker Compose | One command up; documented env; volumes for DB + media; healthcheck |
| **P0** | Coolify / similar PaaS | Compose-based deploy works; domain + HTTPS via their proxy; env UI documented |
| **P1** | NAS / Unraid / CasaOS | Template or one-click compose snippet; persistent paths clear |
| **P2** | Reverse-proxy notes | Traefik / Caddy / nginx examples |
| **P3** | Nextcloud *adjacency* | Link/External site / Dashboard button — not a full Nextcloud PHP app |
| **Later** | True Nextcloud app | Only if demand justifies heavy coupling |

## What we must ship for Coolify (and friends)

Coolify eats **Docker Compose** (or Dockerfile) from Git very well. Prepare:

1. **`compose.yaml`** (committed, hand-maintained for self-hosters) with:
   - `app` service (Effect HttpApi server + built SPA + later MCP)
   - `worker` service (same image, runs the background job worker; see [tech-stack.md](tech-stack.md))
   - `db` (Postgres + PostGIS image `imresamu/postgis:18-3.6`)
   - named **volumes** for uploads / dish photos (`media`) and uploaded plugins (`modules` → `PLACARD_MODULES_DIR`)
   - **healthchecks** so the proxy waits for readiness
   - documented **ports** (e.g. app `3000`)
2. **Environment variables** listed in `.env.example`:
   - `POSTGRES_PASSWORD`
   - `BETTER_AUTH_SECRET` (required, 32+ characters: `openssl rand -base64 32`; changing it signs everyone out)
   - `PUBLIC_URL` (sign-in only works from this origin; invite links point here)
   - optional `GOOGLE_MAPS_API_KEY` (BYOK; can instead be set in Settings). Enable **Places API (New)** and **Maps JavaScript API**. The key reaches the browser for the map, so restrict it to those two APIs and set a daily quota cap (don't add an HTTP-referrer restriction: the server's Places calls send no referrer). Without a key, places are added by dropping a pin on OpenStreetMap
   - `PLACARD_FAKE_GOOGLE` is test-only (answers Google calls from fixtures); never set it in production
   - optional `MCP_ENABLED`, token settings
3. **No hardcoded localhost** assumptions for public URL (respect `PUBLIC_URL` / Coolify domain)
4. **Persistent data** only on volumes — upgrades must not wipe the library
5. Short **Coolify** subsection in install docs: “New Resource → Docker Compose → set domain to app service port”

That is enough for Coolify, Dockge, Portainer, plain VPS, and most NAS Docker UIs.

**Aspire** is for local development (`aspire run`). It can also `aspire publish` Compose artifacts; Placard keeps a readable hand-maintained `compose.yaml` as the Coolify path so self-hosters never need the Aspire CLI. Validate markers with `pnpm compose:generate`.

Nixpacks/Railpack alone are weaker for multi-service (app+db+media). Prefer **Compose as the canonical path**.

## Nextcloud specifically

Three levels of integration:

### A. “Runs beside Nextcloud” (recommended first)

- Placard is its own container stack
- Users bookmark it or add an **External site** / link in Nextcloud
- SSO later via OIDC (Nextcloud / Authelia / Pocket ID) — high value, still not a Nextcloud app

**Effort:** low. **Fit:** matches Immich, Paperless, etc.

### B. Nextcloud “Integration” / dashboard widget

- Deeper UX: open Placard from Nextcloud UI, maybe pass OIDC
- Still separate backend

**Effort:** medium. Depends on Nextcloud APIs and maintenance.

### C. Native Nextcloud app (`apps/placard`)

- PHP/Nextcloud lifecycle, app store listing, NC sharing model
- Fights our module/MCP/Docker-first architecture
- High maintenance tax

**Recommendation:** do **not** plan C for v1. Document A clearly (“works great next to Nextcloud”). Revisit B when solo+household core is stable.

## MCP on deployed instances

MCP is implemented ([mcp.md](mcp.md)):

- Same origin as the app (`https://placard.domain/mcp`) behind PAT auth
- Coolify: no special MCP product support required — it is just HTTPS to the container
- Firewall / auth: MCP must not be anonymously open on the internet; revoke tokens from Settings → MCP

## Backups

Target UX: **one-click backup** (database + media/dish photos), Immich-like — not only “remember to volume-mount and pg_dump”. Document restore as well.

## Install checklist (definition of done for “self-host ready”)

- [x] Official Compose file in repo
- [x] `.env.example` + [install.md](install.md)
- [x] Healthchecks + restart policies
- [x] Documented backup + restore (`pg_dump` + volumes) — one-click UI is v0.2
- [x] Upgrade guidance in install.md
- [x] MCP enabled behind auth + connect snippet for Cursor/Claude
- [ ] Coolify walkthrough verified end-to-end (founder)
- [ ] Optional: Unraid/CasaOS template
- [ ] Optional: OIDC login

## What we should *not* block on

- App Store presence inside Nextcloud
- Kubernetes Helm charts (nice later; Compose first)
- Managed cloud multi-tenant SaaS
