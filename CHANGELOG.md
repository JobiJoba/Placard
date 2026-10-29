# Changelog

All notable changes to Placard are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-10-29

First v0.1 release candidate after phases 0–10.

### Added

- Self-hosted place library (accounts, places, tags, lists, search, enrichment)
- Google Takeout import with free triage and undo
- Dish photos and Google place covers
- Trusted module Marketplace (Decide bundled; prebuilt zip upload)
- Streamable HTTP MCP with PATs; module-owned tools with host-prefixed names
- Per-user library export (`GET /api/export` — JSON, GeoJSON, media zip)
- Installable PWA basics (manifest + icons)
- Install guide (Compose, Coolify, backup, upgrade)
- GHCR publish workflow on `v*` tags (`ghcr.io/<owner>/placard`)

### Notes

- Household sharing and dinner vote remain v0.2
- Instance disaster recovery is still `pg_dump` + volumes (documented); one-click backup UI is later

[0.1.0]: https://github.com/JobiJoba/Placard/releases/tag/v0.1.0
