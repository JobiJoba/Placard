# Placard documentation

A private library for places you want to remember, revisit, and share with your household.

## Start here

- [Product overview](product-overview.md): what Placard does and where it fits.
- [Install](install.md): Docker Compose, configuration, and first setup.
- [User guide](user-guide.md): add places, import Takeout, organize your library, and share.
- [Google APIs](google-apis.md): optional enrichment and map picking with your own key.

## Run an instance

- [Deployment](deployment.md): services, persistent volumes, and reverse proxies.
- [Backup and restore](backup-restore.md): recover the database, photos, and modules together.
- [Upgrade](upgrade.md): update Compose or Coolify while retaining configuration and data.
- [Troubleshooting](troubleshooting.md): diagnose setup, import, and connection problems.
- [Security policy](../SECURITY.md): access, credentials, and trusted modules.
- [v1.0.0 release](release-1.0.md): the first stable release, included features, and current limits.

## Extend and contribute

- [MCP](mcp.md): connect an agent with a revocable personal access token.
- [Create a module](creating-modules.md): build and package a trusted plugin.
- [Module architecture](architecture-modules.md) and [AI authoring brief](module-brief-for-ai.md).
- [Technical architecture](tech-stack.md), [data model](data-model.md), and [Takeout formats](takeout-format.md).
- [Contributing](../CONTRIBUTING.md): development and validation.

## How to read these docs

User and operator guides describe implemented behavior. [Current state](current-state.md)
records validation evidence; the [v1.0.0 release overview](release-1.0.md) describes
the first stable release, published on November 10, 2026. Download install assets
from the [latest published release](https://github.com/placard-app/core/releases/latest).

Early research and planning are retained for context: [vision](vision.md),
[MVP scope](mvp.md), [implementation phases](implementation-phases.md),
[first-user research](first-user.md), [competitors](competitors.md),
[feasibility](feasibility.md), [naming](naming.md), and [restaurant ideas](modules-restaurants.md).
These historical documents are not promises of current functionality.
