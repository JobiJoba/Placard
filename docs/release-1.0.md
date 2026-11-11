# Placard v1.0.0

**v1.0.0 is out.** Placard’s first stable release was published on November 10, 2026.

- [Release notes and downloads](https://github.com/placard-app/core/releases/tag/v1.0.0)
- [Install Placard](install.md) using the latest published release assets.
- [Upgrade an existing instance](upgrade.md) with configuration and data preserved.

This page describes what shipped and the current limits. The dated validation
record is in [current state](current-state.md#validation-evidence); the full
change history is in the [changelog](../CHANGELOG.md).

## Included experience

- Private multi-user place libraries with administrator invitations.
- Manual capture, optional Google capture and enrichment, and Takeout triage/import.
- Search, geographic browsing, tags, private lists, statuses, notes, photos, and custom fields.
- Opt-in household place sharing with owner-controlled edits.
- Personal exports, MCP access, and administrator-installed trusted modules.
- Docker Compose operation, persistent storage, and documented backup/recovery.
- Responsive browser UI with home-screen manifest and icons; online use only.

Five official plugins — Pick, Board, Day Out, Menus, and Decide Together — ship
as pinned builds, inactive by default. Administrators activate them in Marketplace.

The release also includes Bash and PowerShell installers, Compose configuration,
and backup/recovery helpers. The installers create fresh instances; use the
[upgrade guide](upgrade.md) for an existing installation.

## Validation record

The [automated validation record](current-state.md#validation-evidence) includes
unit, integration, and browser tests, typechecks, builds, dependency audits,
installer checks, and a disposable Compose backup → wipe → restore rehearsal.
The recovery rehearsal verifies account login, a place, matching photo/thumbnail
hashes, and module files with test data.

[Manual checks](current-state.md#manual-release-checks) record user-reported passes
for Docker and script installation, Coolify deployment, physical-phone use, and a
500+ item Takeout import. The operator confirmed successful recovery with real
media on November 10, 2026. These reports retain their original level of detail;
they do not establish compatibility with every device, export, or deployment.

Contributor checks for future releases are documented in
[Contributing](../CONTRIBUTING.md#installer-and-release-validation).

## Current limits and future work

Placard needs a connection to your server. Offline operation, native apps, OIDC,
shared lists, guest voting, per-member Google keys, sandboxed plugins, a public
module store, and a one-click backup UI remain future work.

Lists are private; household place sharing is opt-in and administrator-gated.
Modules run as trusted code installed by an administrator. Back up the database,
media, and module volumes together using the [backup and restore guide](backup-restore.md).
