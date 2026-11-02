# What is left before v1.0.0?

**Status as recorded on 2026-11-02: the planned v1 features are implemented.
Four real-world checks still have no recorded pass, followed by publishing the release.**
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
| No recorded pass | Fresh Coolify install | Follow the [install guide](install.md#coolify) on a fresh installation; confirm deployment health and that you can set up, sign in, and save a place. Correct any missing instructions. |
| No recorded pass | Physical-phone check | Add Placard to a phone's home screen, launch it, and check the core flows: sign in, add, search/browse, and open a place. Record the device/browser and any problems. |
| No recorded pass | Real Takeout import | Import a representative collection of about 500 places on Compose. Check triage, commit, Needs review, and browsing/searching the resulting library; record counts and problems. |
| No recorded pass | Recovery with real media | Rehearse the [backup and restore guide](install.md#backup) using a representative instance and its actual media, restoring into separate recovery volumes. Verify login, places, photos, and installed modules. |
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
