# Security policy

Placard is self-hosted software: you run it, you own the data, and you decide who can reach it.
This page explains how to report a vulnerability and what the security model does — and does not —
protect you from.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private vulnerability reporting on
[placard-app/core](https://github.com/placard-app/core/security/advisories/new). Include:

- what you found and why it matters,
- steps to reproduce (a minimal proof of concept is ideal),
- the Placard version or image tag, and your deployment setup (reverse proxy, HTTPS, auth mode),
- any suggested fix, if you have one.

You will get an acknowledgement as soon as possible, usually within a few days. This is a
volunteer-run project, so there is no guaranteed SLA. Please give us a reasonable window to ship a
fix before publishing details. We will credit reporters in the advisory unless you prefer otherwise.

Never include real user data, production database dumps, API keys or session tokens in a report.

## Supported versions

Security fixes land on the latest release and on `main`. Older tags are not maintained. If you run a
pinned image, upgrade to the newest release before reporting an issue that may already be fixed.

## Plugin trust model

The plugin marketplace is powerful by design and is **not** a sandbox:

- A plugin's server code runs **in the Placard process** with access to the database, media files,
  environment secrets and every user's data.
- A plugin's browser code is served from the **same origin** as the app, so it can call every API
  as the signed-in user and read same-origin storage.
- Placard does not sign, verify or audit plugin code. Installing or updating a plugin from a zip, a
  folder or a GitHub Release is equivalent to granting the plugin full control of the instance.

Only install plugins whose source you trust. Before installing anything:

1. **Back up** the database and media volume.
2. **Review the source** — ask an AI assistant or another person to look for unexpected network
   calls, access to credentials, filesystem writes, shell commands, or destructive database
   operations.
3. Prefer downloads over which you can verify a checksum or pinned tag.

A malicious or compromised plugin is not a Placard vulnerability; it is a consequence of installing
untrusted code. Reports about plugins should go to the plugin author first.

## Operational guidance

- Complete the first sign-up **before** exposing a fresh instance to the internet; the first account
  becomes the instance admin.
- Serve Placard over HTTPS and set `PUBLIC_URL` to the exact public origin. Session cookies are
  `httpOnly`, `SameSite=Lax`, and `Secure` when the public URL is HTTPS.
- Use strong, unique values for `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD`; both are required by
  the bundled Compose files. Generate them with `openssl rand -base64 32` and
  `openssl rand -hex 24`.
- Keep the database port private (the bundled Compose file does not publish it).
- Restrict the Google Maps Platform key and set quotas/budget alerts. Signed-in users can read the
  browser key by design.
- Keep backups of the database and media volume, and test a restore. Back up before installing or
  updating plugins.
- Treat MCP personal access tokens like passwords; revoke unused tokens in Settings → MCP.
- Run the app as the unprivileged container user supplied by the image; do not add host mounts you
  do not need.

## Out of scope

- Vulnerabilities in third-party plugins or dependencies (report them upstream; we still want to
  know if Placard's integration makes them worse).
- Misconfiguration of your own deployment: weak or reused secrets, exposing the database port,
  missing TLS, overly permissive Google key restrictions, or granting admin to untrusted users.
- Social engineering, physical access, and denial of service from simply flooding the server with
  traffic.
- Hardening items already documented and accepted in
  [`docs/security-review.md`](docs/security-review.md), including the intentional in-process plugin
  trust model.
