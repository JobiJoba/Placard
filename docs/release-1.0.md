# What is left before v1.0.0?

**Status as recorded on 2026-11-08: the planned v1 features are implemented.
Coolify, physical-phone use, a 500+ Takeout import, Docker installation, and the
script installer have user-reported passes. Recovery with real media remains
unverified; the v1.0.0 release is on hold until that check passes.**
There is no additional feature work currently listed as required for v1. If a
remaining check finds a bug, fixing it becomes part of the release work.

This page tracks preparation for v1.0.0; it does not announce a published release.
Use GitHub release assets for the version you actually install.

## Already done

- **Feature implementation:** the experience listed below is in the code.
- **Local automated validation:** the [current-state record](current-state.md#validation-evidence)
  reports passing typechecks, 112 unit tests, 76 integration tests, 13 browser
  tests, documentation links, and production builds on 2026-11-02.
- **Automated backup and restore:** a disposable Compose instance passed backup,
  volume removal, and restore, including login, a place, photo/thumbnail hashes,
  and module files. This proves the tested recovery path with test data.
- **Release automation:** CI and release tags use shared checks before publishing
  the image and install files. Those checks must also pass for the release commit.

## Still to do before publishing

These are validation tasks, not requests to build more features. “No recorded
pass” means the docs do not establish completion; it does not mean a test failed.

| Status | Task | What counts as done |
| --- | --- | --- |
| User-reported pass | Fresh Coolify install | Working with a generated domain and updated `PUBLIC_URL`; setup reported easy and fast. |
| User-reported pass | Physical-phone check | User confirmed the phone check is OK; device/browser details were not supplied. |
| User-reported pass | Real Takeout import | Import with 500+ Takeout items reported working; exact count and deployment details were not supplied. |
| No recorded pass | Recovery with real media | Rehearse the [backup and restore guide](backup-restore.md) using a representative instance and its actual media, restoring into separate recovery volumes. Verify login, places, photos, and installed modules. |
| Waiting for the checks above | Publish v1.0.0 | Ensure all checks pass on the release commit, publish the tag, and verify the published image and install assets. |

For each completed manual check, add its date, environment, outcome, and any
remaining problems to [current state](current-state.md#manual-release-checks).

**Why recovery appears twice:** the automated recovery check is already done with
test data. The remaining task checks that an operator can recover a representative
instance with its real files by following the guide.

## Included experience

- Private multi-user place libraries with administrator invitations.
- Manual capture, optional Google capture and enrichment, and Takeout triage/import.
- Search, geographic browsing, tags, private lists, statuses, notes, photos, and custom fields.
- Opt-in household place sharing with owner-controlled edits.
- Personal exports, MCP access, and administrator-installed trusted modules.
- Docker Compose operation, persistent storage, and documented backup/recovery.
- Responsive browser UI with home-screen manifest and icons; online use only.

## Can wait until after v1

Offline operation, native apps, OIDC, shared lists, guest voting, per-member Google
keys, sandboxed plugins, and a public module store remain future work. A pick wheel
is an optional external module, not a bundled prerequisite.

Shared lists, dinner voting, one-click backup UI, and the other future features
are not blockers for this release. Automated fixtures do not establish compatibility
with every export or deployment.

## Installer release checks

Before advertising the one-command installer:

- Run `node scripts/check-installers.mjs bash` and `node scripts/check-installers.mjs pwsh`.
  CI also checks Windows PowerShell 5.1, PowerShell 7, Linux, and macOS.
- With the current app image built as `placard:dr-check`, run
  `node scripts/check-installer-smoke.mjs`. It creates and removes only its own
  randomly named Compose project, checks all three services and `/api/health`.
- Manually exercise initial signup with Docker Desktop on macOS and Windows,
  including a directory with spaces, local access, and a custom port. These manual
  checks remain required before claiming those Docker Desktop combinations verified.
- Publish the release with `docker-compose.yml`, `example.env`, `install.sh`, and
  `install.ps1`. Each generated installer embeds its own release tag and repository.
- Deploy Pages only once both latest-release installer URLs resolve. The Pages
  workflow checks this before building; rerun it manually after publication if needed
  (GitHub-token-created releases may not trigger another workflow).

V1 installs fresh instances only. Existing configuration, credentials, and volumes
must be managed with the backup and manual upgrade instructions.
