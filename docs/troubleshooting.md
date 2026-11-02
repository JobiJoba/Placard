# Troubleshooting

Start with the failing step and preserve your data while investigating. Run Compose
commands from the install directory containing your configuration.

## The app does not start

Run `docker compose ps` and `docker compose logs --tail=100 app worker db`.
Check that `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` are set, the database is
healthy, and the host port is available. The auth secret must contain at least 32
characters. `/api/health` should return a successful response once the app is ready.

Changing a database password in `.env` does not change an existing Postgres role.
Follow the password guidance in [installation](install.md). Do not delete volumes
to solve a startup problem unless you intend to discard their contents.

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
