# v1.0.0 release readiness

This is the release contract for preparing Placard 1.0.0. It does not announce a
published release or change package versions. Use GitHub release assets for the
version you actually install.

## Included experience

- Private multi-user place libraries with administrator invitations.
- Manual capture, optional Google capture and enrichment, and Takeout triage/import.
- Search, geographic browsing, tags, private lists, statuses, notes, photos, and custom fields.
- Opt-in household place sharing with owner-controlled edits.
- Personal exports, MCP access, and administrator-installed trusted modules.
- Docker Compose operation, persistent storage, and documented backup/recovery.
- Responsive browser UI with home-screen manifest and icons; online use only.

## Outside this release contract

Offline operation, native apps, OIDC, shared lists, guest voting, per-member Google
keys, sandboxed plugins, and a public module store remain future work. A pick wheel
is an optional external module, not a bundled prerequisite.

## Release gates

| Gate | Evidence or remaining work |
| --- | --- |
| Automated code validation | Shared CI: audit, lint, types, unit, integration, browser, and image checks |
| Recovery | Disposable Compose backup → wipe → restore check verifies login, place, photos, and module files |
| Fresh deployment | Complete the guide on a fresh Coolify installation |
| Phone experience | Verify home-screen install and core workflows on a physical phone |
| Real collection | Validate a representative Takeout import of about 500 places |
| Operator recovery | Rehearse recovery with a representative instance and its actual media |
| Release artifacts | Publish v1.0.0 only after gates pass; verify image and install assets |

Record dates, environment, and outcomes in [current state](current-state.md). Automated
fixtures do not establish compatibility with every export or deployment. Keep remaining
gates visible until they have been completed.
