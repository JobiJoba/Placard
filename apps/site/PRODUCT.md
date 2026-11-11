# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary visitor is a self-hoster evaluating whether to try Placard: already comfortable with Docker / a NAS / a VPS, likely leaving or supplementing Google Maps Saved, and deciding whether this instance is worth standing up. The job in the moment is evaluation that leads to Install — not day-to-day library use (that lives in the web app).

## Product Purpose

`apps/site` is Placard’s public marketing and install surface. It presents a product tour, household sharing, optional extensions, installation, and an FAQ, then gets the visitor to a running Compose instance. Success is a visitor who leaves with Placard up (`docker compose up`), not one who only browsed features or starred the repo.

## Positioning

Immich-adjacent for starred places: Compose-up from GHCR, data on your disk, private to you (or an invited household). Beats Google Maps Saved for structured use of *your* library. Tagline: *Your places. On your cards. On your server.* The site sells ownership + install simplicity; MCP and Marketplace modules support that story rather than replacing the install CTA.

## Operating Context

Vite + React marketing + docs site. Home (`/`) persuades and points to Install. Docs (`/docs`, `/docs/:slug`) render selected markdown from repo `docs/` with a left side nav and article content — Meet Placard, User guide, Install, Google APIs, Troubleshooting, v1.0.0 release, Deployment, MCP, modules, Takeout. `/install` redirects to `/docs/install`. Source of truth remains the markdown files in `docs/`; the site is the reading surface. Secondary outbound: GitHub repo and AGPL license.

## Capabilities and Constraints

- Confirmed routes: Home, Plugins (`/plugins`), Docs index, Docs pages; primary CTAs Install (→ docs) + GitHub.
- Plugins lists Menus and Pick with cover illustrations, descriptions, copyable module-specific GitHub install URLs, source links and installation steps.
- Install path: published stable GHCR image via release installers and Compose assets; `:nightly` is an opt-in experimental build.
- Do not invent a live public demo, SaaS signup, pricing, or hosted trial unless product truth changes.
- Published docs set is curated in the site docs catalog (not every internal planning doc).
- Production marketing domain: `placard.fyi`. A hosted screenshot/demo gallery remains a future option.

## Brand Commitments

- Product name: **Placard**
- Tagline: *Your places. On your cards. On your server.*
- License: AGPL-3.0
- Feels at home next to Immich / Paperless / Jellyfin; not a consumer SaaS brand

## Evidence on Hand

- Site copy in `apps/site` (Home + Docs shell)
- Canonical docs markdown: `docs/*.md` (Install, Google APIs, Deployment, MCP, …)
- Runnable product UI elsewhere: `apps/web`
- GitHub: https://github.com/placard-app/core
- Do not fabricate testimonials, customer logos, benchmarks, or public user counts

## Product Principles

1. **Install is the win** — Every surface should make Compose-up the obvious next step for a convinced visitor.
2. **Own the library** — Messaging centers self-hosted ownership; never imply a public social or cloud-SaaS default.
3. **Short path on-site, depth in docs** — Keep Install scannable; link out for Coolify, APIs, backup, and source builds.
4. **Honest claims only** — No invented social proof; position with Immich-class self-hosting and real capabilities (library, modules, MCP).
5. **Self-hoster-true** — Write for people who already run containers, not for onboarding tourists to Docker.

## v1.0.0 editorial direction

Warm paper, dark ink, rust accents, and large catalog typography retain the app’s collection identity. Lead with the value of remembering and rediscovering places; use the real library screenshot as product evidence. The site announces v1.0.0 as the first stable release, published on November 10, 2026. Keep the release overview aligned with shipped features and current limits; link installation to the latest published release assets.
