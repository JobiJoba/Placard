# Install Placard — Docker Compose

Docker Compose is the **recommended** way to run Placard. You pull a published image from GHCR; you do not build from source.

Architecture notes: [deployment.md](deployment.md).

**On this page**

1. [Quick install](#quick-install-recommended)
2. [Requirements](#requirements)
3. [Step 1 — Download](#step-1--download-the-required-files)
4. [Step 2 — `.env`](#step-2--populate-the-env-file)
5. [Step 3 — Start](#step-3--start-the-containers)
6. [Image tags](#image-tags)
7. [Coolify](#coolify)
8. [Dokploy](#dokploy)
9. [Backup](#backup)
10. [Build from source](#build-from-source-contributors)
11. [Library export & MCP](#library-export--mcp)

Google Maps Platform setup (API key, restrictions, smoke-check) lives in **[google-apis.md](google-apis.md)**.

## Quick install (recommended)

Install and start [Docker with Compose](https://docs.docker.com/compose/install/) first.
Use Docker Desktop on macOS or Windows (Linux-container mode), or Docker Engine with
Compose on Linux. The installer targets AMD64 and ARM64 Linux containers. Docker
must be accessible from your terminal without elevation. No Git, Node, pnpm, or
Aspire is needed.

**Linux / macOS — Bash:**

```sh
bash <(curl -fsSL https://github.com/JobiJoba/Placard/releases/latest/download/install.sh)
```

**Windows — PowerShell 5.1 or 7:**

```powershell
& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing https://github.com/JobiJoba/Placard/releases/latest/download/install.ps1).Content))
```

These commands download and execute the published installer. To inspect it first,
download `install.sh` or `install.ps1` from the [latest release](https://github.com/JobiJoba/Placard/releases/latest),
read the file, then run `bash ./install.sh` or `& ./install.ps1`. PowerShell file
execution follows your existing execution policy; the installer does not change it.
Installer assets are available starting with the release that introduces this feature;
older releases retain the manual Compose instructions below.

The installer asks for:

| Setting | Default |
| --- | --- |
| Installation directory | `./placard-app` (must not already exist) |
| Host port | `3000` |
| Public URL | `http://localhost:<port>` |
| Access | `local` — binds to `127.0.0.1`; `network` binds to `0.0.0.0` |

It downloads configuration from the **same release as the installer**, generates
random database and authentication secrets, protects `.env`, and waits for the
app, worker, and database to become healthy. Secrets are never printed. Configure
Google later in Settings → Integrations. The success URL does not verify external
DNS, HTTPS, firewall rules, or reverse-proxy routing.

Create the first administrator account before exposing the instance. On a remote
server, keep local access and tunnel from your computer for initial setup:

```sh
ssh -L 3000:127.0.0.1:3000 user@your-server
```

Then open `http://localhost:3000`. For later network access, edit
`PLACARD_BIND_ADDRESS=0.0.0.0` and `PUBLIC_URL` in `.env`, then run
`docker compose up -d` from the install directory. For a reverse proxy running on
the host, the loopback binding can remain. Configure HTTPS separately; a remote
public URL must match the actual browser origin, without a trailing slash or path.

### Automated setup

After downloading the installer, pass the same settings as flags:

```sh
bash ./install.sh --non-interactive --directory ./placard-app --port 3001 --public-url http://localhost:3001 --access local
```

```powershell
& ./install.ps1 -NonInteractive -Directory ./placard-app -Port 3001 -PublicUrl http://localhost:3001 -Access local
```

Noninteractive mode accepts the defaults for omitted settings. Installers refuse
existing directories, Placard containers, or persistent volumes, and reject inherited
Compose/app variables that could override the installation. They do **not** upgrade
an existing instance or remove data. Use [Upgrade](#upgrade) for existing installs.
If startup fails, fix the reported issue and run `docker compose up -d --wait` from
the retained installation directory; do not rerun the installer over it.

From that directory, use `docker compose ps`, `docker compose logs --tail=100`, and
`docker compose stop` to inspect or stop the instance. See [troubleshooting](troubleshooting.md).

## Manual installation

The following steps remain available for users who want to manage Compose directly,
and for releases without installer assets.

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
| `POSTGRES_PASSWORD` | Database password — `openssl rand -hex 24`. Required; set it **before the first start** (the database volume keeps the initial password) |
| `BETTER_AUTH_SECRET` | Session signing secret — `openssl rand -base64 32` |
| `PUBLIC_URL` | Exact URL users open (e.g. `https://placard.example.com` or `http://localhost:3000`) |

Both Compose files refuse to start if `POSTGRES_PASSWORD` or `BETTER_AUTH_SECRET` is unset or
empty. Rotating `POSTGRES_PASSWORD` later requires changing the role inside Postgres (`ALTER ROLE`)
or restoring a dump; editing `.env` alone is not enough once the volume exists.

Optional:

- `PLACARD_PORT` — host port (default `3000`)
- `PLACARD_BIND_ADDRESS` — published Compose host binding (manual default `0.0.0.0`; installer default `127.0.0.1`)
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

The first account to sign up becomes **admin**. Complete that sign-up before exposing the instance
to the internet.

Back up the database and media volume before installing plugins or upgrading. See
[SECURITY.md](../SECURITY.md) for the plugin trust model.

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
3. Set env from `example.env` (`POSTGRES_PASSWORD` ← `openssl rand -hex 24`, `BETTER_AUTH_SECRET` ← `openssl rand -base64 32`, `PUBLIC_URL=https://your-domain`)
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
2. Set env from `example.env` (`POSTGRES_PASSWORD` ← `openssl rand -hex 24`, `BETTER_AUTH_SECRET` ← `openssl rand -base64 32`, `PUBLIC_URL=https://your-domain`)
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
Run these commands from your install directory with its Compose file and `.env`.

Stop app and worker first so the database and files describe the same point in time.
Leave Postgres running for `pg_dump`; do not tar a running database's data volume.

```sh
mkdir -p backup
chmod 700 backup
docker compose stop app worker
docker compose exec -T db pg_dump -U placard -Fc placard > backup/database.dump
docker compose run --rm --no-deps -T app tar czf - -C /data/media . > backup/media.tgz
docker compose run --rm --no-deps -T app tar czf - -C /data/modules . > backup/modules.tgz
# Run only after all three backup commands succeed:
docker compose start app worker
```

Keep all three files together. Store a copy of your Compose file, `.env`, and image
version securely alongside the backup: the environment contains credentials and
must not be committed. Copy completed backups off the instance. If a backup step
fails, resolve it before treating the backup as complete; start the app and worker
again when you are ready to resume writes.

### Restore

Restore to a **fresh instance with empty volumes**, using the same image version
and saved environment. Start from a new install directory with its Compose file
and `.env`; put the three backup files in `backup/`. If another stack is running
on the same Docker host, give the recovery stack a distinct `COMPOSE_PROJECT_NAME`
and host port. The restore replaces database objects; use empty recovery volumes
to avoid overwriting an existing instance.

```sh
docker compose up -d --wait db
docker compose exec -T db pg_restore -U placard -d placard --clean --if-exists --no-owner --exit-on-error < backup/database.dump
docker compose run --rm --no-deps -T app tar xzf - -C /data/media < backup/media.tgz
docker compose run --rm --no-deps -T app tar xzf - -C /data/modules < backup/modules.tgz
docker compose up -d --wait
```

Check `/api/health`, sign in, open a saved place, and verify its photos and installed
modules before routing users to the restored instance. Restore the original version
first; upgrade only after verifying recovery.

### Contributor recovery check

From a source checkout with Docker running:

```sh
pnpm check:recovery
```

This builds the image, creates a randomly named Compose project bound only to
loopback, creates a test account/place/photo, stops writers, backs up, removes
**only that generated project's volumes**, restores, and verifies login, the place,
photo and thumbnail hashes, and a module-volume marker. It cleans up the temporary
stack afterward. It does not use the checkout's `.env` or existing instance volumes.
It checks the Compose recovery path; Coolify deployment and phone home-screen
installation still require manual checks.

## Build from source (contributors)

For forks and local image builds, use the repo [`compose.yaml`](../compose.yaml):

```sh
git clone https://github.com/JobiJoba/Placard.git
cd Placard
cp .env.example .env
# Set POSTGRES_PASSWORD (openssl rand -hex 24), BETTER_AUTH_SECRET
# (openssl rand -base64 32) and PUBLIC_URL
docker compose up -d --build
```

Day-to-day development: `aspire run` — see the [README](../README.md#develop).

## Library export & MCP

- **Export:** Settings → General → Export library (`GET /api/export`) — personal zip, not instance DR.
- **MCP:** Settings → MCP — create a PAT; endpoint `$PUBLIC_URL/mcp`. Details: [mcp.md](mcp.md).

### Persistent module data

Module code lives under `/data/modules/<moduleId>`; SDK 1 module data lives under
`/data/modules/.data/<moduleId>`. The whole-volume archive above includes both,
including hidden directories. Stop writers before archiving SQLite-backed modules.
Updates and uninstall retain `.data`; reinstall reconnects to it. To permanently erase
an uninstalled module's retained data, remove only its `.data/<moduleId>` directory.
Personal library exports do not contain module data.
