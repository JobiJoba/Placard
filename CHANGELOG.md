# Changelog

All notable changes to Placard are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- CI publishes `ghcr.io/<owner>/placard:nightly` (and `nightly-<sha>`) when `main` goes green — opt-in for testers; does not move `:latest`
- Install modules from a public GitHub Release; update check + Marketplace Update
- Per-place custom fields; preferred maps app; Cmd+K palette

### Removed

- Bundled Decide module (`restaurants.decide`) — use Marketplace Pick (sibling `placard-places-pick`) or another wheel instead

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

- Household sharing and dinner vote remain v0.2
- Instance disaster recovery is still `pg_dump` + volumes (documented); one-click backup UI is later

[0.1.0]: https://github.com/JobiJoba/Placard/releases/tag/v0.1.0
