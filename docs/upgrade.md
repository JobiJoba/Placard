# Upgrade Placard

Upgrade an existing installation while keeping its configuration and persistent
data. The Bash and PowerShell installers create fresh instances; do not rerun them
over an existing install.

## Before upgrading

1. Choose a published version from [GitHub Releases](https://github.com/JobiJoba/Placard/releases)
   and read its release notes and [changelog](../CHANGELOG.md), including any
   instructions for intermediate versions. A planned version is not available
   until its release image and assets have been published.
2. Complete a [backup](backup-restore.md) of the database, media, modules, configuration,
   and secrets. Record the old image tag/digest. For important libraries, rehearse
   restoring that backup into separate volumes before upgrading.
3. Wait for imports and enrichment to finish and schedule a short interruption.
   Keep the same database password, authentication secret, public URL, project name,
   and storage mounts. Preserve `pgdata`, `media`, and `modules`.

Placard runs database migrations when the app starts. Restoring the pre-upgrade
backup is the recovery path if the new release changes the schema; switching only
the image back is not a supported database rollback.

## Docker Compose and script installations

The commands use Bash and run from your existing installation directory. Check
`docker compose ps` shows the intended instance. If your installation needs explicit
project or file options, use those same options on every command below.

### 1. Review the target release configuration

Download the target release's `docker-compose.yml` to a **different filename**
using the release page. Compare it with your installed file and merge any required
service/environment changes, preserving local ports, storage, project name, and
proxy configuration. Compare `example.env` for new settings; do not replace `.env`
with the example or regenerate secrets.

With bundled HTTPS, also review that release's `docker-compose.override.yml` and
`Caddyfile`, retaining your domain and Caddy volumes. With a panel-managed proxy,
keep the panel configuration and omit the bundled HTTPS overlay.

### 2. Pin the app and worker to the target image

Edit the existing `.env` and set `PLACARD_IMAGE` to the chosen **published** version.
For example, `v0.2.15` uses:

```dotenv
PLACARD_IMAGE=ghcr.io/jobijoba/placard:0.2.15
```

Replace `0.2.15` with your target release number, without the leading `v`.
The standard Compose file uses this variable for both app and worker. An existing
`PLACARD_IMAGE` overrides the default image in a newly downloaded Compose file.
Avoid moving tags such as `latest` or `nightly` for a controlled upgrade.

### 3. Pull, stop writers, and recreate

```sh
docker compose config --images
docker compose pull app worker
```

Confirm both services resolve to the chosen version and that the pull succeeds.
Then stop the old writers before starting the new app, so an old worker does not
run against a migrating database:

```sh
docker compose stop app worker
docker compose up -d --wait app
docker compose up -d --wait worker
docker compose ps
```

Named volumes survive container recreation. Do not use `down --volumes`, delete
storage, or change the Compose project name. These commands deliberately upgrade
app and worker; upgrading Postgres/PostGIS across major versions is a separate
operation requiring its own database migration plan.

If startup fails, inspect logs before retrying. Keep the pre-upgrade backup and
configuration until you have completed the checks below.

## Coolify and Dokploy

Upgrade the **existing Compose resource**, retaining its persistent storage and
public domain (a Coolify-generated domain is fine).

1. Make a [full backup](backup-restore.md#quick-start), including
   media and module data; database backups alone are insufficient.
2. Review the target release's Compose and environment changes. Merge them into
   the resource without replacing its storage definitions or adding the standalone
   Caddy overlay. Preserve the existing app routing to internal port `3000` and
   any removal of the app's host `ports:` block.
3. Set the resource's `PLACARD_IMAGE` to `ghcr.io/jobijoba/placard:<version>` with
   the actual published number. Confirm **both app and worker** use that value;
   update any hard-coded image references together.
4. During the maintenance window, stop the old app and worker before deploying
   the new version. Leave the database and volumes intact. Redeploy the same
   resource with the updated image, and wait for all three healthchecks. Ensure
   the panel pulls the new image rather than reusing the old containers.
5. Keep `PUBLIC_URL` equal to the existing browser origin. A version upgrade does
   not require a new domain, database password, or authentication secret.

If the panel reports a failed deployment, inspect app and worker logs and verify
which images actually started before allowing users back in. Do not delete and
recreate the production resource to resolve an image update.

## Verify the upgraded instance

- Open your usual URL and `/api/health`.
- Sign in with an existing account; compare library counts and search for a known place.
- Open photos/thumbnails and check installed modules and their saved data.
- Add and edit a test place, then confirm background imports/enrichment work if used.
- Check app and worker logs for migration errors, repeated restarts, or missing files.

For Compose:

```sh
docker compose logs --tail=100 app worker
```

A green healthcheck establishes service readiness; the library and media checks
confirm you are using the expected data. Keep the backup off-server after upgrading.

## If you need to roll back

Stop app and worker so no more writes happen. Save logs and keep the current
volumes for diagnosis. Any changes made since the pre-upgrade backup will not
exist in that backup.

Follow [Backup and restore](backup-restore.md#restore-into-separate-recovery-volumes)
to restore **all three archives** into fresh volumes with the old image and saved
configuration. Verify that recovered instance before switching routing. Do not
assume an older app can read a database that a newer version has migrated.
