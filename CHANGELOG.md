# Changelog

All notable changes to Placard are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] — 2026-11-10

First stable release, including the features introduced in 1.0.0-rc1.

### Changed

- Upgrade runtime, frontend, tooling, and container dependencies.
- Move unfinished pg-boss 10 jobs to the pg-boss 12 schema on startup; stop the old app and worker before upgrading.
- Synchronize plugin documentation and record the operator-confirmed recovery check with real media.

### Fixed

- Enable coordinated queue supervision so abandoned jobs recover after worker crashes and completed jobs are cleaned up.

## [1.0.0-rc1] — 2026-11-08

### Added

- Marketplace in desktop and mobile navigation, with illustrated plugin cards, previews, and admin activation
- Five official plugins included and inactive by default, with immediate activation and preserved existing installations
- A dismissible marketplace invitation for populated libraries, saved per account across devices
- Optional Google Maps setup after creating the administrator account, with guided API-key instructions
- Decide Together on the public plugins page

### Changed

- Plugin uploads, GitHub installs, and update controls are grouped under Manage plugins
- Empty libraries focus on importing or adding places


### Fixed

- Installers fall back to exact release-asset API URLs when GitHub release downloads fail; the docs site serves verified installer copies to avoid the same failure on the initial download

## [0.9.0] — 2026-11-08

### Added

- Operator recovery helper for Compose and Coolify: database, media, modules, environment, exact images, and backup checksums; restore into an isolated local copy with fresh volumes
- Dedicated backup/recovery and version upgrade documentation, with a short scripted recovery walkthrough
- Automated tests for recovery failure handling and a full helper backup/restore with login, photo/thumbnail hashes, and module files

- Admin-gated household mode: share/unshare places, claim-first Google-place conflicts with copy-into, library Everyone / Mine / Shared filters
- Profile name and avatar from Settings → General
- Block a member (signs them out and prevents sign-in while keeping their data) or permanently delete them from Settings → People
- Install modules from a public GitHub Release; update check + Marketplace Update
- Per-place custom fields; preferred maps app; Cmd+K palette

### Removed

- Bundled Decide module (`restaurants.decide`) — use Marketplace Pick (sibling `placard-places-pick`) or another wheel instead

## [0.2.8] — 2026-11-02

### Fixed

- Use accessible switches with explicit On/Off labels for module MCP access in module settings and the MCP page; disable the switches while saving

[0.9.0]: https://github.com/placard-app/core/releases/tag/v0.9.0

[0.2.8]: https://github.com/placard-app/core/releases/tag/v0.2.8

## [0.2.7] — 2026-11-02

### Fixed

- Plugin callbacks use the app's internal listener instead of the public host port or proxy, fixing menu detail requests when Docker publishes a different port (such as 4000)

[0.2.7]: https://github.com/placard-app/core/releases/tag/v0.2.7

## [0.2.6] — 2026-11-02

### Added

- Optional HTTPS with a public domain in the Bash and PowerShell installers, using Caddy for automatic certificates, renewal, and HTTP redirects
- Persistent Caddy certificate storage and release assets for the bundled HTTPS proxy
- Installer validation and Docker checks for HTTPS configuration, redirects, and proxy traffic

[0.2.6]: https://github.com/placard-app/core/releases/tag/v0.2.6

## [0.1.1] — 2026-10-29

Release-assets and marketing-site release.

### Added

- GitHub Pages marketing site with install guide and library screenshots (`apps/site`)
- Release install assets: `docker-compose.yml` and `example.env` published on `v*` tags
- CI publishes `ghcr.io/<owner>/placard:nightly` (and `nightly-<sha>`) when `main` goes green — opt-in for testers; does not move `:latest`

### Changed

- Install guide leads with download → `.env` → `docker compose up` instead of a local build

[0.1.1]: https://github.com/placard-app/core/releases/tag/v0.1.1

## [0.1.0] — 2026-10-29

First v0.1 release candidate after phases 0–10.

### Added

- Self-hosted place library (accounts, places, tags, lists, search, enrichment)
- Google Takeout import with free triage and undo
- Dish photos and Google place covers
- Trusted module Marketplace (prebuilt zip upload; Decide was bundled in this release, later removed)
- Streamable HTTP MCP with PATs; module-owned tools with host-prefixed names
- Per-user library export (`GET /api/export` — JSON, GeoJSON, media zip)
- Installable PWA basics (manifest + icons)
- Install guide (Compose, Coolify, backup, upgrade)
- GHCR publish workflow on `v*` tags (`ghcr.io/<owner>/placard`)

### Notes

- Household sharing shipped after this tag on `main`; dinner vote remains later
- Instance disaster recovery is still `pg_dump` + volumes (documented); one-click backup UI is later

[0.1.0]: https://github.com/placard-app/core/releases/tag/v0.1.0

[1.0.0-rc1]: https://github.com/placard-app/core/releases/tag/v1.0.0-rc1

[1.0.0]: https://github.com/placard-app/core/releases/tag/v1.0.0
