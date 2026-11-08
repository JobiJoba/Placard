# Backup and restore

Use the recovery helper to back up a Compose or Coolify installation and restore a
separate copy for testing. It saves the database, photos, modules, environment,
and exact Docker images, then checks the backup files with SHA-256 checksums.
Settings → Export library is a personal export, not an instance backup.

## Quick start

You need **Python 3.9+ and Docker Compose v2+** on the Docker host. No Python
packages, Node.js, or source build is needed. For Coolify, SSH into the server
hosting Placard; run the helper on the host, not inside the app terminal.

The helper is included starting with **v0.9.0**. Download `placard-recovery.py` from
[the release assets](https://github.com/JobiJoba/Placard/releases/tag/v0.9.0) and place
it on your Docker server. From a source checkout, use `scripts/placard-recovery.py`.
Only run a script you trust and restore backups you created or trust.

### 1. Back up

With `placard-recovery.py` in your current directory:

```sh
python3 placard-recovery.py backup --output ./placard-backup
```

Choose your instance from the list. The helper finds its app, worker, and database
using Compose project labels, including on Coolify. It:

- Stops app and worker briefly so database and files stay consistent.
- Backs up the database, photos, and complete module storage.
- Restarts the original services even if a backup step fails.
- Saves the exact app and database images, so a restore does not depend on an old
  image still being downloadable. This can add significant disk space and time;
  the original instance is running again during the image save.
- Writes a private backup directory and marks it complete only after validation.

Wait for imports/enrichment to finish first. On Coolify, pause automatic
redeployments during the operation. The helper requires one running app, worker,
and database with the standard Placard paths and bundled `db` service; it refuses
unsupported layouts or mismatched app/worker versions before stopping services.

For an unattended run, give the project explicitly:

```sh
python3 placard-recovery.py backup --project YOUR_PROJECT --output ./placard-backup
```

Find the project name with `docker compose ls`. The output directory must not
already exist; choose a new name for the next backup. Keep the whole folder private
and copy it off-server. It contains credentials, private data, and executable module
code. Save your panel/domain configuration separately for a future production cutover.

### 2. Restore a test copy

```sh
python3 placard-recovery.py restore ./placard-backup --directory ./placard-recovery
```

The helper verifies checksums, loads the saved images, and restores all data into
**new volumes under a random project name**. It never replaces your existing
instance or attaches its volumes. The destination directory must not already exist.

Open **http://localhost:3001** in a private browser window. If Docker runs on a
remote server, first open this tunnel from your computer:

```sh
ssh -L 3001:127.0.0.1:3001 user@your-server
```

If port 3001 is busy, add `--port 3002` to the restore command and use 3002 in the
browser and tunnel. A failed restore stops its own recovery containers and retains
the files/volumes for diagnosis. Your original instance stays running.

The test copy binds only to localhost and uses an internal Docker network without
external network access. MCP is disabled. Restored queued jobs can run in that copy,
but external Google calls and module integrations cannot reach the internet.
This is an isolated recovery rehearsal; external integrations will need to be
checked after a deliberate production cutover.

### 3. Verify and stop

Sign in with your **existing account**. Check library counts, find a known imported
place, open several photos/thumbnails, and verify installed modules and their saved
data. A healthcheck alone does not establish successful recovery.

The helper prints the exact command to stop the test copy. You can also use its
new directory:

```sh
cd placard-recovery
docker compose -f compose.json stop
```

This retains the test volumes. Keep the backup and original instance. Record the
date, version, approximate place/photo counts, and any problems; the manual release
check passes only once you have checked your actual restored library and media.

## Recover after a server failure

Copy the complete backup folder and helper onto the replacement Docker server and
run the same restore command. It includes the old images and settings, so you can
verify your data before exposing it.

After verification, deliberately configure the real `PUBLIC_URL`, reverse proxy,
HTTPS, and normal networking before routing users to the recovered instance.
The generated Compose file is for isolated testing; it is not an automatic Coolify
resource import. On Coolify, use a separate recovery resource and arrange the
verified restored storage/configuration before switching its domain. Keep your
saved panel configuration for this step. Restore the old version first, then
follow [Upgrade](upgrade.md).

## Manual recovery reference

Use the commands below for customized deployments or to understand the underlying
steps. The helper above is the shorter path for standard Compose and Coolify stacks.

<details>
<summary>Show manual backup and restore instructions</summary>

## Before you start

The commands below use **Bash** on Linux, macOS, or an SSH session on your Docker
server. Do not paste binary archive redirections into Windows PowerShell 5.1;
use Bash on the Docker host instead. You need Docker access, disk space for the
archives and a second copy of the data, and a short maintenance window.

- Wait for imports and enrichment to finish. Stop both app and worker during backup.
- Keep Postgres running for `pg_dump`. Do not archive a live `pgdata` volume.
- Save the Compose configuration, environment/secrets, and exact image version with
  the backup. Include any overrides and `Caddyfile` for bundled HTTPS.
- Protect backups as carefully as the instance: they include private places,
  account data, API credentials, and executable module code. Keep an off-server copy.

The steps assume the standard database name/user `placard` and mount paths
`/data/media` and `/data/modules`. Adjust them if you customized your deployment.

## Back up a Compose installation

Run in your existing installation directory (including script-created installs).
Use the same Compose project/options you normally use; `docker compose ps` must
show your existing app, worker, and database before proceeding.

Create a new backup directory for each run:

```sh
umask 077
backup_dir="$PWD/backup-$(date +%Y%m%d-%H%M%S)"
mkdir "$backup_dir"
cp .env docker-compose.yml "$backup_dir/"
# If present, also copy docker-compose.override.yml and Caddyfile.
docker compose images > "$backup_dir/images.txt"
docker inspect --format '{{.Config.Image}}' "$(docker compose ps -q app)" > "$backup_dir/app-image.txt"
docker inspect --format '{{.Image}}' "$(docker compose ps -q app)" > "$backup_dir/app-image-id.txt"
docker image inspect --format '{{json .RepoDigests}}' "$(docker inspect --format '{{.Image}}' "$(docker compose ps -q app)")" > "$backup_dir/app-image-digests.json"
```

Record a pinned release tag or registry digest. `latest` and `nightly` can move;
`images.txt` and the image ID help identify what actually ran. If you use a moving
tag, resolve and save its matching registry digest before relying on this backup.

Run each command in order, checking that it succeeds before continuing:

```sh
docker compose stop app worker
docker compose exec -T db pg_dump -U placard -Fc placard > "$backup_dir/database.dump"
docker compose run --rm --no-deps -T --pull never app tar czf - -C /data/media . > "$backup_dir/media.tgz"
docker compose run --rm --no-deps -T --pull never app tar czf - -C /data/modules . > "$backup_dir/modules.tgz"
```

The whole module archive includes hidden `.data` directories and module SQLite
files. If any step fails, keep the error and redo the backup; a partial archive
is not a complete backup. Resume service when ready:

```sh
docker compose start app worker
```

Keep the three archives and saved configuration together. Continue with
[Check the backup](#check-the-backup).

## Back up a Coolify installation

SSH into the **Docker server hosting Placard**. These commands run on the host,
not inside the app's terminal. In Coolify, save a private copy of the resource's
Compose configuration and environment values, including `POSTGRES_PASSWORD`,
`BETTER_AUTH_SECRET`, `PUBLIC_URL`, and image overrides. Record the domain mapping.
Keep the same resource and persistent storage when redeploying.

Find the three containers for this specific resource:

```sh
docker ps --format 'table {{.ID}}	{{.Names}}	{{.Image}}'
```

Replace the placeholders below with those container IDs. Verify their names in
Coolify; do not select another resource's database. Pause automatic redeployments
for this resource during the backup so container IDs and volumes stay stable.

```sh
app_container=REPLACE_WITH_APP_CONTAINER_ID
worker_container=REPLACE_WITH_WORKER_CONTAINER_ID
db_container=REPLACE_WITH_DB_CONTAINER_ID
umask 077
backup_dir="$PWD/placard-backup-$(date +%Y%m%d-%H%M%S)"
mkdir "$backup_dir"
app_image=$(docker inspect --format '{{.Image}}' "$app_container")
docker inspect --format '{{.Config.Image}}' "$app_container" > "$backup_dir/app-image.txt"
printf '%s\n' "$app_image" > "$backup_dir/app-image-id.txt"
docker image inspect --format '{{json .RepoDigests}}' "$app_image" > "$backup_dir/app-image-digests.json"
docker inspect --format '{{json .Mounts}}' "$app_container" > "$backup_dir/app-mounts.json"
```

Save the private configuration and environment copies in that directory too.
Record the exact release tag or registry digest, especially with moving tags.
Then run each command separately and check its result:

```sh
docker stop "$app_container" "$worker_container"
docker exec "$db_container" pg_dump -U placard -Fc placard > "$backup_dir/database.dump"
docker run --rm --volumes-from "$app_container:ro" --entrypoint tar "$app_image" czf - -C /data/media . > "$backup_dir/media.tgz"
docker run --rm --volumes-from "$app_container:ro" --entrypoint tar "$app_image" czf - -C /data/modules . > "$backup_dir/modules.tgz"
docker start "$app_container" "$worker_container"
```

The temporary archive containers use the stopped app's mounted storage and exact
local image, with read-only volume access. They do not start Placard. This follows
Docker's [volume backup approach](https://docs.docker.com/engine/storage/volumes/#back-up-restore-or-migrate-data-volumes).
Confirm the original resource is healthy again and re-enable any paused deployment
settings. A database-only backup does not include photos or module files.

## Check the backup

In the same Bash session, check archive readability. For a Compose backup, first
set `db_container=$(docker compose ps -q db)`; for Coolify, keep the database
container ID selected above:

```sh
test -s "$backup_dir/database.dump"
docker exec -i "$db_container" pg_restore --list < "$backup_dir/database.dump" > /dev/null
tar tzf "$backup_dir/media.tgz" > /dev/null
tar tzf "$backup_dir/modules.tgz" > /dev/null
```

All commands must succeed. Archive readability alone does not prove recovery;
complete the restore and application checks below. Copy the finished backup to
protected storage on another machine.

## Restore into separate recovery volumes

This is also the recommended rehearsal for your real library. Keep the original
instance running after its backup; never remove its volumes for this exercise.
The recovery copy contains the same private data and module code.

1. Create a **new directory** outside the installation, for example `placard-recovery`.
2. Copy the backup's `database.dump`, `media.tgz`, and `modules.tgz` into a `backup/`
   subdirectory there.
3. Copy the release `docker-compose.yml` and saved `.env` into the new directory.
   For a Coolify backup, download the Compose file from the **same backed-up release**
   and create `.env` using the saved environment values. Keep the database password
   and authentication secret. Do not run the fresh-install script or create an account.
4. In this copy of `.env`, pin `PLACARD_IMAGE` to the backed-up release or digest.
   Set `PLACARD_PORT=3001`, `PLACARD_BIND_ADDRESS=127.0.0.1`, and
   `PUBLIC_URL=http://localhost:3001`. Choose another free port if needed.
5. Use only the base Compose file for this rehearsal. Leave out the HTTPS override,
   Caddy, production domains, and panel proxy labels. Clear `GOOGLE_MAPS_API_KEY`
   in the recovery environment; database-stored integration settings and queued
   jobs are still restored, so consider their external effects before starting.

From the new directory, use an explicit, unique project name **on every command**.
The release file includes `name: placard`; changing directory alone does not isolate
volumes. Docker's [`-p` option](https://docs.docker.com/compose/how-tos/project-name/)
overrides that name.

```sh
recovery_project=placard-recovery-$(date +%Y%m%d-%H%M%S)
docker compose -p "$recovery_project" -f docker-compose.yml config --volumes
docker compose -p "$recovery_project" -f docker-compose.yml config --images
```

Inspect the Compose file before starting: the standard `pgdata`, `media`, and
`modules` declarations must not have `external: true`, explicit production
`name:` values, or bind mounts pointing to live data. Project isolation only
protects volumes whose names Compose manages. Ensure no shell variables override
the recovery `.env` values.

Start only the database, restore the three archives, then start the application.
Run each command separately; if one fails, stop and resolve it before continuing.

```sh
docker compose -p "$recovery_project" -f docker-compose.yml up -d --wait db
docker compose -p "$recovery_project" -f docker-compose.yml exec -T db pg_restore -U placard -d placard --clean --if-exists --no-owner --exit-on-error < backup/database.dump
docker compose -p "$recovery_project" -f docker-compose.yml run --rm --no-deps -T app tar xzf - -C /data/media < backup/media.tgz
docker compose -p "$recovery_project" -f docker-compose.yml run --rm --no-deps -T app tar xzf - -C /data/modules < backup/modules.tgz
docker compose -p "$recovery_project" -f docker-compose.yml up -d --wait
docker compose -p "$recovery_project" -f docker-compose.yml ps
```

On a remote server, open an SSH tunnel from your computer:

```sh
ssh -L 3001:127.0.0.1:3001 user@your-server
```

Open `http://localhost:3001` in a private browser window. Do not switch the original
domain to the rehearsal instance.

## Verify recovery

Use a few known places and photos from before the backup as your reference:

- `/api/health` responds successfully; app, worker, and database are healthy.
- Sign in with an existing account. A fresh setup screen or empty library means
  the expected database was not restored or mounted; do not create a replacement account.
- Compare library counts; search for an imported place and open its details.
- Check tags, lists, notes, household visibility, and custom fields you actually use.
- Open original photos and thumbnails on several places. For stronger evidence,
  compare SHA-256 hashes of files downloaded before and after recovery.
- Verify installed modules load and their saved data is present. An empty module
  directory can leave database registrations pointing to missing code.
- Inspect logs for database, migration, missing-file, or module errors:

```sh
docker compose -p "$recovery_project" -f docker-compose.yml logs --tail=100 app worker
```

Record the date, backed-up version, deployment (Compose or Coolify), approximate
place/photo counts, checks performed, and any problems. Only mark the real-media
recovery check passed after the restored application works with actual media.

Stop the rehearsal when finished; this keeps its volumes for further inspection:

```sh
docker compose -p "$recovery_project" -f docker-compose.yml stop
```

Keep the backup and original instance. If recovering from an actual failure,
verify the restored instance first, then configure its real `PUBLIC_URL`, proxy,
and HTTPS before routing users to it. For Coolify, create a separate recovery
resource with fresh persistent storage; do not attach the original volumes or
route the production domain until verification is complete.

## Automated contributor check

From a source checkout with Docker running, `pnpm check:recovery` exercises a
disposable Compose stack with a test account, place, photo/thumbnail hashes, and
module-volume marker. It runs the operator helper and verifies a separate recovered
instance while retaining the source until cleanup. It uses fixture data. The manual
rehearsal above verifies your deployment, real library, photos, and modules.

</details>
