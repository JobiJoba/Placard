# Troubleshooting

Start with the failing step and preserve your data while investigating. Run Compose
commands from the install directory containing your configuration.

## Installer problems

- **Docker missing or daemon unavailable:** install/start Docker Desktop, or Docker
  Engine with Compose on Linux. Check `docker info` in the same terminal. The installer
  does not install prerequisites, elevate privileges, or change Docker permissions.
- **Windows containers selected:** switch Docker Desktop to Linux containers.
- **Compose too old:** update Compose to a version supporting `up --wait --wait-timeout`.
- **Download failed / 404:** check connectivity and that the selected release contains
  installer assets. Use manual installation for older releases. Failed downloads do
  not create an installation directory.
- **Destination or project exists:** the installer only creates fresh installations.
  Use the existing directory and documented upgrade steps; never delete volumes to
  bypass this check. A separate installation requires a separate Docker host/context.
- **Port occupied:** choose another port before installing. After a failed start,
  edit `PLACARD_PORT` and, for local access, `PUBLIC_URL` in the retained `.env`.
- **Readiness timeout or image pull failure:** configuration and data are retained.
  Inspect `docker compose ps` and logs, fix the cause, then retry
  `docker compose up -d --wait` from the install directory.
- **Remote browser cannot connect:** local access binds only to loopback. Use the SSH
  tunnel in the install guide, or explicitly configure network binding and the exact
  browser origin. A healthy stack does not confirm external DNS or HTTPS setup.

## The app does not start

Run `docker compose ps` and `docker compose logs --tail=100 app worker db`.
Check that `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` are set, the database is
healthy, and the host port is available. The auth secret must contain at least 32
characters. `/api/health` should return a successful response once the app is ready.

Changing a database password in `.env` does not change an existing Postgres role.
Follow the password guidance in [installation](install.md). Do not delete volumes
to solve a startup problem unless you intend to discard their contents.

## Image pull fails with `no matching manifest for linux/arm64/v8`

The server uses ARM64, but the selected image tag has no ARM64 variant. This happens
before the app starts; changing environment variables will not resolve it.

Release and nightly publishing target both `linux/amd64` and `linux/arm64`. Older
images such as `ghcr.io/jobijoba/placard:0.1.1` may only contain AMD64. The workflow
change does not update images already published: publish a new release containing
the fix, then select that version in Coolify and redeploy. Alternatively, testers
can set `PLACARD_IMAGE=ghcr.io/jobijoba/placard:nightly` after a successful nightly
publish containing the fix, provided their Compose configuration uses that variable.

Inspect a tag before deploying it:

```sh
docker buildx imagetools inspect ghcr.io/jobijoba/placard:0.1.1
```

Look for `linux/arm64` in its platform list. Setting `platform: linux/amd64` requires
emulation on an ARM64 server; it does not add ARM64 support to the image.

## Sign-in fails behind a proxy

Set `PUBLIC_URL` to the exact origin you open, including the scheme and any nonstandard
port. Route the domain to the app service on port 3000. Preserve HTTPS at the browser
and check proxy routing before resetting accounts. Complete first signup before
making the instance broadly accessible.

## Google search or enrichment is unavailable

Check **Settings → Integrations**, the enabled APIs, billing, quotas, and key restrictions.
The instance uses one key for browser and server requests; incompatible application
restrictions can block one side. Follow [Google APIs](google-apis.md). Manual pins
remain available without a key.

## An import appears stuck

Check the worker status and logs. Confirm the ZIP is within the upload limit and
contains supported [Takeout files](takeout-format.md). An uncertain match belongs
in **Needs review**, where you can choose a match or skip it. Avoid repeated commits
or broad refreshes while diagnosing provider errors.

## Near me is empty

Allow browser location access and use HTTPS for remote access. Switch to **All** to
check that places are present, then widen the radius or select a city. Clear filters
that may exclude results.

## Photos or modules disappeared after moving servers

Verify that both file volumes were restored alongside the database. A database dump
alone does not contain photos or module code. Follow [backup and restore](install.md#backup)
and verify file ownership and volume mounts before changing records.

## An MCP client cannot connect

Use your instance's `/mcp` endpoint, confirm MCP is enabled, and verify the token is
valid. Test reachability from the client machine, including its trust of your TLS
certificate. See [MCP](mcp.md) for authentication and transport details.

## Report a problem

Include the application version or image tag, deployment method, browser, steps to
reproduce, and relevant redacted logs in a GitHub issue. Remove tokens, API keys,
cookies, personal place data, and environment secrets. Report vulnerabilities using
[the security policy](../SECURITY.md).
