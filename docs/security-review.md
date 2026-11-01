# Security review — Placard

**Date:** 2026-11-01
**Scope:** whole repository (server, web, packages, compose/Docker, CI, docs, git history)
**Method:** static review + targeted secret scanning + dependency audit. No live penetration test or DAST was run.
**Bottom line:** no credentials are committed to the repository or its git history. The architecture has one deliberate high-risk decision (in-process plugins) and a handful of medium issues worth fixing before wider exposure.

---

## 1. Secret / key-leak check

| Check | Result |
| --- | --- |
| `.env` in git | **Never tracked** (verified with `git log --all -- .env` — no commits touch the path) |
| `.env.compose-check` in git | Never tracked |
| `.env` / `.env.*` ignore rules | Present (`.gitignore:8-10`), `.env.example` explicitly allowed |
| Secret patterns in working tree¹ | No matches |
| Secret patterns in full git history (all refs, 40 commits) | No matches² |
| Tracked key/keystore/credential files | None |
| Provider key formats (`AIza…`, `ghp_…`, `github_pat_…`, `sk-…`, `xox…`, `AKIA…`, PRIVATE KEY, JWTs) | None in tracked content or history |
| Lockfile supply chain | All resolutions via integrity-checked registry tarballs; no `http://` tarballs and no git dependencies |
| `.dockerignore` | Excludes `.env`, `.env.*`, `.git`, docs, tests — secrets do not enter the image build context |

¹ Searched the tree excluding `node_modules`, `dist`, lockfile and git internals.
² The only `BETTER_AUTH_SECRET=` hit in history is the documented generation command `export BETTER_AUTH_SECRET=$(openssl rand -base64 32)`.

### Local files that hold real credentials (not committed)

- `.env` contains a real-format Google API key (`AIza…`, 39 chars) and a 44-char `BETTER_AUTH_SECRET`. Both are correctly ignored. The key value appears nowhere else in the repo or history.
- `.env` still uses `POSTGRES_PASSWORD=change-me` (the example value). Fine for a local DB that is not published to the host, but it is a deployment footgun — see **M6**.
- `.cursor/mcp.json` (git-ignored) contains a live-format personal access token (`plc_…`, 36 chars, matching `Tokens.mintSecret()`). It is only a local agent config, but treat it as a credential at rest: revoke it in Settings → MCP if this directory is ever shared, synced, zipped, or backed up.
- `.specstory/history/`, `test-results/`, `.impeccable/` are ignored; the tracked `.specstory` files are config only. Commit-time redaction is enabled by default in SpecStory (`[redaction] enabled`), but history is not committed anyway.

**Verdict: no key leak found in the repository.** The remaining exposure is local-at-rest only.

---

## 2. Findings overview

| ID | Severity | Finding |
| --- | --- | --- |
| H1 | High | Plugins are arbitrary code executed in-process and in the app origin, installed without signature/integrity verification |
| H2 | High (conditional) | First account to sign up becomes admin; no setup token, so an exposed pre-setup instance can be taken over |
| M1 | Medium | No security headers (CSP, `X-Frame-Options`, `X-Content-Type-Options`, HSTS, `Referrer-Policy`) |
| M2 | Medium | No request/decompression size caps on import; unbounded in-memory inflate (zip bomb) and body buffering |
| M3 | Medium | One Google key shared between browser and server, unrestricted by application; every signed-in user can read it |
| M4 | Medium | `zod@4.1.12` has a high-severity advisory (fixed in `>=4.6.6`) |
| M5 | Medium | Login brute-force protection is only Better Auth defaults (100 req / 10 s per IP), no explicit rules, no lockout |
| M6 | Medium | Compose falls back to `POSTGRES_PASSWORD=placard` when unset; only the auth secret is enforced |
| L1 | Low | Public `/api/health` returns raw DB error text; public `/openapi.json` |
| L2 | Low | Plugin HTTP helpers forward the caller's cookie / bearer token to arbitrary absolute URLs |
| L3 | Low | Audit log redaction is shallow (top-level keys only) |
| L4 | Low | Media/avatar responses lack `nosniff` and cache directives; MIME comes from the DB (allowlisted on upload) |
| L5 | Low | Admin ZIP install has no decompressed-size cap and serves `.svg` with `image/svg+xml` |
| L6 | Low | No `SECURITY.md`, Dependabot/Renovate, or `pnpm audit` in CI |
| I1 | Info | Committed design screenshots and some takeout fixtures reference real neighbourhood places |

No Critical findings (no unauthenticated RCE, SQL injection, or committed secret).

### Remediation status (2026-11-01)

| ID | Status |
| --- | --- |
| H1 | **Accepted + documented.** The in-process plugin model is intentional and unchanged. Install/update flows now show a trust warning and require confirmation, and `SECURITY.md` explains the model. Sandboxing and signature verification remain a product decision. |
| H2 | **Accepted risk** (owner decision): no setup token for the first admin. Documented "complete setup before exposing" guidance. |
| M1 | **Fixed.** `apps/server/src/http/security.ts` adds CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS to every response. HSTS is sent unconditionally; browsers ignore it over plain HTTP, and TLS normally terminates at the reverse proxy. |
| M2 | **Fixed.** Import caps in `packages/domain/src/import.ts` / `apps/server/src/import/parse.ts` (50 MB zip, 5,000 files, 128 MB inflated text) plus a 72 MB cap on declared `content-length` that returns `413`. Chunked bodies without a length are still bounded only by the per-service limits. |
| M3 | **Open** — documented as a key-restriction/quota decision (see below). |
| M4 | **Fixed.** `zod` bumped to `4.6.7`, `shadcn` moved to dev dependencies, `pnpm audit --prod` is clean, and CI now runs it. |
| M5 | **Open** — Better Auth defaults only; explicit per-route limits and trusted-proxy config still recommended. |
| M6 | **Fixed.** Both Compose files require a non-empty `POSTGRES_PASSWORD`; `.env.example`, README and `install.md` show `openssl rand -hex 24`. |
| L1 | **Open** (health detail and public OpenAPI). |
| L2 | **Deferred** with the plugin trust model: `hostFetch` still forwards caller credentials. Revisit if plugins ever get a narrower trust boundary. |
| L3 | **Open** (shallow audit redaction). |
| L4 | **Partially fixed** — global `nosniff` now covers media/avatar responses; explicit cache directives still recommended. |
| L5 | **Open** — module ZIP inflation happens before the uncompressed cap, and `.svg` assets are served inline. |
| L6 | **Fixed.** Added `SECURITY.md`, Dependabot config and `pnpm audit --prod --audit-level high` in CI. |
| I1 | **Open** — privacy pass on fixtures/screenshots if the repository stays public. |

---

## 3. Findings in detail

### H1 — Plugin trust model is arbitrary code execution

**Evidence**
- Server: `apps/server/src/modules/loader.ts:117-133` and `:157-171` dynamic-`import()` a plugin's server entry into the **main process**; plugins receive `rootDir`, `hostFetch`, and the module host API.
- Browser: `apps/web/src/components/plugin-page-host.tsx:25` dynamically imports the plugin web entry from `/api/modules/:id/assets/...`, i.e. **same origin as the app**, so plugin JS can call every API as the signed-in user and read `localStorage`.
- Install paths: `apps/server/src/modules/modules.ts:474-502` (upload / GitHub). Uploads are admin-only (`requireAdmin`), which is good.
- GitHub installs: `apps/server/src/modules/github-install.ts:156-215` download the latest release asset over HTTPS but **verify no checksum or signature**. The SHA-256 of an uploaded zip is computed (`package-zip.ts:54`, written to `.installed.json`) but never checked again and never stored in the DB.

**Impact**
Installing (or updating) a plugin is equivalent to granting root on the instance: read the database, all media, the auth secret, and every user's data. A malicious or compromised upstream repo release is executed automatically the next time an admin clicks "update" (update *checks* are automatic; installs are not — good).

**Recommendations**
- Document the trust model prominently ("only install plugins you trust; a plugin is as powerful as the server").
- Verify integrity on update: persist the installed SHA-256 and abort if it changes unexpectedly, or support pinned release tags and signed manifests.
- Consider moving plugin server code to a child process / `worker_threads` with a restricted API surface, or at minimum a separate origin for plugin pages (needs a second hostname, which is heavy).
- Treat the MCP/`/api/m/*` helpers as privileged API (see L2).

---

### H2 — First-signup admin bootstrap has no setup token

**Evidence**
- `apps/server/src/accounts/signup.ts:30`: `openCondition = signup_open or not exists (select 1 from users)`.
- `apps/server/src/accounts/signup.ts:46-49`: if `claimBootstrap` succeeds, the new account gets `role = "admin"`.
- `apps/server/src/auth/auth.ts:87-93`: email+password signup enabled; no email verification.
- Documented behaviour: `docs/install.md:105` — "The first account to sign up becomes admin."

**Impact**
Anyone who reaches a fresh instance before the owner does can register the admin account. Scanning bots find new services quickly; the window is small but real. The same applies after a restore where the `users` table is empty (`not exists users` recovery path), and the `signup_open` flag has no UI to re-enable open registration, so the recovery branch is the only path — by design.

**Recommendations**
- Require a one-time setup token (`PLACARD_SETUP_TOKEN` or a token printed to logs on first boot) for the bootstrap signup, or bind bootstrap to a request from a loopback/private address until the first user exists.
- Document "complete setup before exposing the instance" in `install.md`.
- Log when bootstrap signup is claimed.

---

### M1 — No security headers

**Evidence:** no `Content-Security-Policy`, `X-Frame-Options` / `frame-ancestors`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`, or `Permissions-Policy` anywhere in `apps/server` / `packages`; the SPA static layer (`apps/server/src/main.ts:21-34`) has none either.

**Impact:** no clickjacking defence, no defence-in-depth against XSS (session cookie is `httpOnly` + `SameSite=Lax`, so cookie theft is not the primary risk — account actions are), and media/plugin asset responses can be MIME-sniffed.

**Recommendations:** add a middleware/layer that sets at least:
`X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), and a CSP that permits the Google Maps domains and plugin assets (`script-src 'self' https://maps.googleapis.com`). Add HSTS only when `PUBLIC_URL` is HTTPS. Because plugin JS is same-origin ESM, a strict CSP needs `script-src 'self'` and cannot rely on nonces for dynamically imported plugin bundles — document that trade-off.

---

### M2 — Unbounded import inflation and body buffering (DoS)

**Evidence**
- `apps/server/src/import/parse.ts:252-258`: `unzipSync(bytes)` inflates **the entire archive into memory**, with no limit on uncompressed bytes, entry count, or per-entry size.
- `apps/server/src/import/parse.ts:265-268`: base64 is decoded with no size cap.
- `packages/domain/src/import.ts:86-101`: upload schema has no maximum length.
- Any authenticated member can `POST /api/import`. A small zip bomb (`~1 MB → GBs`) can exhaust the Node heap and take down the API for everyone.
- Media uploads cap at 15 MB (`apps/server/src/media/media.ts:20`) and module zips at 25 MB (`package-zip.ts:14`), but those checks run **after** the whole JSON body has been buffered; no global body limit was found in the server config.

**Recommendations**
- Reject import bodies above a fixed size before decoding/base64 (e.g. 50 MB) and cap decompressed bytes/entries (mirror `MAX_UNCOMPRESSED_BYTES` / `MAX_FILES` from `package-zip.ts`, which already does this correctly).
- Add an HTTP-level body limit; return `413`.
- Consider streaming the import parse to the worker instead of the request process.

---

### M3 — Single unrestricted Google API key

**Evidence**
- `apps/server/src/http/places.ts:146-151` returns the key to any authenticated user (`GET /api/google/config`).
- `docs/google-apis.md:49-53` intentionally uses one key for both browser and server and recommends **application restriction "None"** (referrer restrictions break server calls).
- `docs/google-apis.md:53` correctly notes it must be treated as visible to signed-in users.

**Impact:** any household member (or anyone who obtains the key from devtools / a screenshot / client logs) can use it from anywhere, subject only to API restrictions and quotas. Cost abuse is the realistic risk; a leaked key also reveals the owner's Google Cloud project.

**Recommendations (low effort)**
- Keep quota caps (already documented) and set budget alerts.
- Prefer **two keys**: a browser key restricted to HTTP referrers (`PUBLIC_URL`) for Maps JavaScript, and a server key restricted to the Places API + server egress IP for enrichment. That contradicts the current one-key design and needs a small config change, so track it as a decision.
- Avoid logging the key; ensure it is redacted in error reports.

---

### M4 — Vulnerable `zod` version

**Evidence:** `apps/server/package.json` pins `zod: 4.1.12`; `pnpm audit --prod` reports **high**: *Zod can exhaust memory while validating oversized constrained collections* (`GHSA-mrhx-c7xc-m3w5`, fixed in `>=4.6.6`). Reached directly and via `@modelcontextprotocol/sdk`.

**Impact:** memory exhaustion from attacker-controlled payloads (MCP tool arguments are validated with zod and are token-authenticated). Low likelihood, cheap to fix.

**Recommendation:** bump `zod` to `>=4.6.6`, re-run `pnpm test:unit` / `test:integration`, and add `pnpm audit --prod` to CI (fail on high).

Other audit results are dev/build-only: `minimatch <11.0.1` and `deepmerge` come in through `shadcn` (a CLI dependency of `apps/web`) and are not present in the runtime image (`Dockerfile` installs only server/domain/module-sdk prod deps). Still worth upgrading or moving `shadcn` to `devDependencies`.

---

### M5 — Login brute-force protection is default-only

**Evidence:** `apps/server/src/auth/auth.ts:70-125` does not configure `rateLimit` or `advanced.ipAddress`. Better Auth 1.7.13 defaults to `enabled: isProduction`, `window: 10s`, `max: 100` per IP (`better-auth/dist/context/create-context.mjs:170-175`). `NODE_ENV=production` is set in the runtime image, so it is active — but 100 attempts per 10 s is generous for a password form, and IP resolution behind Caddy/Traefik needs a trusted-proxy configuration or `X-Forwarded-For` can be spoofed to bypass it.

**Recommendation:** configure explicit rules, e.g. `/sign-in/email`: `{ window: 60, max: 5 }`, plus a global stricter default; configure `advanced.ipAddress.ipAddressHeaders`/trusted proxies to match the deployed proxy; consider a small per-account backoff. Password minimum is 8 (`auth.ts:87`) — consider 12 for a household app.

---

### M6 — Weak database-password defaults in Compose

**Evidence:** `compose.yaml:4,20` and `compose.ghcr.yaml:12,32` use `${POSTGRES_PASSWORD:-placard}`. `BETTER_AUTH_SECRET` is enforced with `:?`; `POSTGRES_PASSWORD` is not. The local `.env` still carries `change-me`.

**Impact:** an operator who copies `.env.example` and only fills `BETTER_AUTH_SECRET` gets a weak DB password. The DB is not published to the host and is only reachable on the Compose network, so this is defence-in-depth rather than immediate exposure.

**Recommendation:** use `${POSTGRES_PASSWORD:?...}` in both compose files, and update `docs/install.md` to tell users to generate it (`openssl rand -hex 24`). Rotating it later requires a `pg_dump`/restore or `ALTER ROLE`, so document that.

---

### L1 — Health and OpenAPI exposure

`GET /api/health` is public by design and returns `checks.database.error` verbatim (`apps/server/src/health.ts:42-44` → `buildReport`). On a DB outage this can disclose host/database names or driver internals. `/openapi.json` is also public (`apps/server/src/http/api.ts:30`). Recommendation: return a generic error to unauthenticated callers (or gate the detail behind admin), and keep `/openapi.json` if it is useful for the MCP/API docs.

### L2 — Plugin helpers forward credentials to arbitrary URLs

- `apps/server/src/http/modules.ts:208-219`: `hostFetch` builds `new URL(path, webRequest.url)` and copies the caller's **session cookie** plus `origin` onto the request. An absolute URL (`https://…`) sends the user's cookie off-origin.
- `apps/server/src/mcp/tools.ts:339-343`: same pattern with `Authorization: Bearer <tokenSecret>`.

A plugin can already read data in-process, so this is not an escalation for server code, but it turns a reviewed plugin into a credential-exfiltration primitive and would become serious if plugin code ever gains a narrower trust boundary. Recommendation: only allow same-origin relative paths (reject anything with a scheme/host), or maintain an explicit allowlist.

### L3 — Shallow audit redaction

`apps/server/src/tokens/tokens.ts:179-186` redacts only top-level keys matching `/secret|token|password|key/i`; nested objects are stored verbatim in `mcp_audit.input`. Recommendation: redact recursively and cap stored argument size.

### L4 — Media response hardening

`apps/server/src/http/media.ts:52` and `apps/server/src/http/accounts.ts:182-185` set only `Content-Type`. Upload MIME is allowlisted (`jpeg/png/webp`, `media.ts:23`) and avatars are re-encoded by `sharp`, so this is not a stored-XSS hole today. Add `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=…`, and consider `Content-Disposition: inline` for defence-in-depth.

### L5 — Module ZIP inflation and SVG assets

`extractModuleZipBytes` inflates the whole archive before checking `MAX_UNCOMPRESSED_BYTES` (`package-zip.ts:56-76`), so a 25 MB zip bomb can exhaust memory during an admin install (admin-only, so low). Separately, `.svg` assets are served as `image/svg+xml` (`apps/server/src/http/modules.ts:104-105`); an SVG opened directly runs scripts in the app origin. Prefer serving plugin assets from a separate origin or forcing `Content-Disposition: attachment` for `.svg`.

### L6 — Missing security hygiene in CI/repo

No `SECURITY.md` (private vulnerability reporting / contact), no Dependabot or Renovate config, and no `pnpm audit` step in `.github/workflows/ci.yml`. CI already runs lint, typecheck, unit, integration, e2e and an image build with `permissions: contents: read` — a good baseline. Add dependency review + a secret scanner (gitleaks) as cheap guardrails.

### I1 — Fixtures and screenshots

`test/fixtures/takeout/` is documented as anonymised, and most entries are public places (Café Sperl, Vienna), but `Saved/Default list.csv` references Brussels addresses that look personally meaningful (`Rue de la Cambre 281`, `School Core Martin V`). Tracked design screenshots (`apps/web/.impeccable/review/*.png`) show local businesses near the author. These are public places rather than home addresses, but it is worth a privacy pass if the repository is public. The root `Takeout/` ignore rule is present — keep raw exports out of the repo.

---

## 4. Controls that are in good shape

- **Session handling:** Better Auth with `trustedOrigins` limited to `PUBLIC_URL`, `httpOnly` + `SameSite=Lax` cookies, `Secure` automatically when the base URL is HTTPS (`better-auth/dist/cookies/index.mjs:23`), rotating secret enforced at ≥32 chars, and blocked users' sessions are checked on every request (`auth.ts:129-141`).
- **Authorization:** every API group has `Authentication`; the whole admin group has `AdminAuthentication` (`packages/domain/src/api.ts:206`), with self-block/self-delete guards. Place mutations are owner-scoped; reads are household-scoped only when the admin enables it.
- **Tokens:** random 24-byte `plc_…` secrets, only SHA-256 hashes stored, revocation supported, blocked users rejected, per-token MCP rate limit, audit trail.
- **Invites:** 32-byte tokens, hashed at rest, 7-day TTL, single use, bound to email, previous pending invite revoked.
- **Uploads:** MIME allowlist + byte sniffing + `sharp` re-encode for avatars; image MIME allowlist + size cap for place media; no user-controlled paths on disk (paths are built from UUIDs).
- **ZIP installs:** zip-slip, absolute path, drive-letter and `..` guards with `ensureInside`; size/file-count caps on the compressed side; module id validated as a safe directory name.
- **SQL:** parameterized queries throughout; the only `sql.raw` (`db/schema.ts:150-151`) is used exclusively with compile-time constant arrays for check constraints.
- **Paths:** `resolveAsset` rejects `..`, backslashes and leading slashes; media file resolution is a DB lookup, not a path join from user input.
- **MCP:** bearer-only (no ambient cookie auth), CORS `*` is safe here because credentials are explicit headers, `MCP_ENABLED=false` kill switch, per-token limiter, audited tool calls.
- **Containers:** runtime image runs as `node` (non-root), `NODE_ENV=production`, DB port not published, `.dockerignore` excludes env files and git.
- **Exports:** per-user zip honours ownership and intentionally excludes household places (`http/export.ts:21-25`).

---

## 5. Suggested remediation order

**Done in the 2026-11-01 quick-win pass:** M1, M2 (import limits + declared-length body cap), M4, M6,
L6, and the H1 install warnings/documentation. `shadcn` moved to dev dependencies, so
`pnpm audit --prod` is clean. The plugin trust model and first-signup bootstrap were intentionally
left unchanged. The global body cap only rejects a declared `content-length` above 72 MB; a
determined client using chunked encoding can still stream more, which the per-service limits then
have to absorb.

**Next**

1. Tighten Better Auth rate limits and trusted-proxy/IP handling (**M5**).
2. Decide on a setup token or loopback-only bootstrap for the first admin (**H2**).
3. Two-key Google setup: referrer-restricted browser key plus egress-restricted server key (**M3**).
4. Health-detail gating, recursive audit redaction, explicit media cache headers, module ZIP
   inflation handling and SVG disposition (**L1/L3/L4/L5**).
5. Privacy pass on fixtures/screenshots if the repository stays public (**I1**).

**Only if the trust model changes**

6. Plugin integrity (persisted checksum or signed manifests), sandboxing and restriction of
   `hostFetch` to same-origin paths (**H1/L2**). These are deliberately out of scope while plugins
   remain trusted in-process code.

---

## 6. What this review did not cover

- No dynamic testing against a running instance (auth bypass, IDOR, race conditions in place/media/import flows were reviewed only statically).
- No review of third-party code beyond versions reported by `pnpm audit`.
- No Google Cloud project inspection (key restrictions, quotas, billing alerts).
- No backup/restore or secret-rotation procedure verification.
- No threat model workshop with the maintainers — priorities above assume a self-hosted, invite-only instance that may be internet-facing.
