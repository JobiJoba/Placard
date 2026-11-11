# Creating a Placard module

Ship a **prebuilt zip** and upload it in **Settings → Module marketplace**. Self-hosted instances (Docker / Coolify / Dokploy) do not compile TypeScript inside the container.

> **Building a module with an AI assistant?** Paste the brief on [FOR AI — module brief](module-brief-for-ai.md) into the prompt. This page is the human walkthrough.

## Skeleton (start here)

A minimal uploadable starter lives in the repo:

| | |
| --- | --- |
| Path | [`packages/modules/skeleton/`](../packages/modules/skeleton/) |
| Module id | `example.skeleton` |
| Build | `pnpm --filter @placard/module-skeleton build:zip` |
| Zip | `packages/modules/skeleton/dist/example.skeleton-0.1.0.zip` |

It exposes `GET /hello`, a small page, a CMD+K action (**Open Skeleton**), and MCP tool `skeleton_hello` so you can verify Marketplace + palette + MCP wiring before adding real behavior. Rename the id/paths when you turn it into a real module.

Richer example: **`places.pick`** — generic “pick any category” wheel in the [Pick repository](https://github.com/placard-app/module-pick). Install via zip upload or GitHub Release.

## What you ship

A zip (or `.placard-module`) containing:

```
placard.module.json
server/index.js      # ESM — export createModule()
web/index.js         # browser ESM — export your page component(s)
web/assets/…         # optional icon / cover
```

| Piece | Role |
| --- | --- |
| Manifest | Id, nav, permissions, entries, optional CMD+K actions, optional MCP tool list |
| Server | HTTP under `/api/m/<id>/*` and optional MCP tools |
| Web | Page at `/m/<id>` (export name from the manifest) |

No wheel ships inside the Placard image. For a real product module, mirror the **zip layout** of **`places.pick`** (or clone the skeleton), not a monorepo workspace package copy.

## Manifest (`placard.module.json`)

```json
{
  "id": "places.pick",
  "name": "Pick",
  "version": "0.1.1",
  "description": "Spin one place from your library.",
  "permissions": ["places.read", "search.query"],
  "nav": [{ "path": "/m/places.pick", "label": "Pick", "slot": "primary", "mobileIcon": "dices" }],
  "source": "upload",
  "sdkVersion": "0.1.0",
  "serverEntry": "./server/index.js",
  "webEntry": "./web/index.js",
  "icon": "web/assets/icon.svg",
  "webRoutes": [{ "path": "/m/places.pick", "exportName": "PickPage" }],
  "actions": [
    {
      "id": "open",
      "label": "Pick a place",
      "keywords": "spin wheel random",
      "path": "/m/places.pick"
    }
  ],
  "mcpTools": [
    {
      "name": "pick_place",
      "title": "Pick a place",
      "description": "Pick one place from the library with the same filters as the UI."
    }
  ]
}
```

Rules:

- `id` is `family.feature` (e.g. `places.pick`)
- `permissions` ⊆ `places.read` | `search.query` | `media.read`
- `source` must be `upload` for Marketplace zips
- `sdkVersion` must be supported by the host (SDK 1 plus legacy SDK 0 today)
- Nav path and API prefix use the same id: `/m/<id>`, `/api/m/<id>/*`
- Optional `icon` supplies the marketplace and phone navigation image. Use a square SVG or PNG, include it in the zip (e.g. `web/assets/icon.svg`), and set its path relative to the package root. Absolute HTTPS URLs or root-relative URLs also work. Phone navigation shows a puzzle icon when the image is missing or fails to load.
- Optional `nav[].mobileIcon` selects a [Lucide icon](https://lucide.dev/icons/) by kebab-case name (e.g. `dices`, `shuffle`, `map-pin`) for the phone bottom navigation only. It uses the same size, stroke and active color as the built-in menu icons; the marketplace image stays unchanged. Missing, unknown or unavailable names fall back to the module `icon`, then the puzzle icon.
- Optional `actions` appear in **CMD+K → Actions** and navigate to `path` when selected (same visibility gate as `nav`)

## Server entry

Export `createModule()` that returns optional `createHttpApp` and/or `mcpTools`.

- Call the host with `ctx.hostFetch` (e.g. `POST /api/search`) — **never** core SQL
- Persist module-private data under `ctx.dataDir` (Compose volume `modules`); `ctx.rootDir` is replaceable installed code
- MCP: declare **local** tool names only; Placard registers `places_pick__pick_place` style globals
- List the same local names under manifest `mcpTools` so Settings can show them

## Web entry

- Export a page component whose name matches `webRoutes[].exportName`
- Bundle for the browser; **do not ship React** — use the host bridge (`globalThis.__PLACARD_PLUGIN__`) the same way the skeleton / `places.pick` repos do
- Call your HTTP API at `/api/m/<your.id>/…` with the user’s session cookies

## Build and pack

1. Bundle server (Node ESM) and web (browser ESM) with esbuild or similar — **self-contained** server bundle (working practice for uploads)
2. Assemble the zip layout above
3. From this repo you can use `pnpm placard:pack ./path/to/pack` when the pack folder is ready

Reference trees:

- Skeleton starter: `packages/modules/skeleton/`
- Upload / GitHub wheel: [Pick module repository](https://github.com/placard-app/module-pick)

## Install on an instance

1. Admin → **Settings → Module marketplace → Choose .zip**, **or** paste a public GitHub repo URL / `owner/repo`
2. For GitHub: publish a **Release** whose asset is the prebuilt plugin (prefer `*.placard-module`, else a clear `.zip` — not a source archive)
3. Placard extracts to `PLACARD_MODULES_DIR/<id>/` (Compose volume `modules`)
4. Enable the module for the instance
5. Each user: Marketplace → module → **Settings** → show in nav / allow MCP

Install an official module using its repository URL, such as `https://github.com/placard-app/module-menus`.

For multiple modules in one repository, append `#module.id` to the GitHub URL, for
example `https://github.com/owner/repo#places.menus` or `#places.pick`. Publish
independent stable releases tagged `<module.id>@<version>` with the module's prebuilt
asset. Installation and update checks follow that selector, skip drafts/prereleases,
and validate the downloaded manifest ID. Existing single-module repo URLs still use
GitHub's latest release endpoint. The selector is retained in the installed source URL;
no database migration is needed.

After install, module tools appear under **Settings → MCP** with their global names. GitHub-sourced modules show an update badge when a newer Release is available.

## Checklist

- [ ] Zip has `placard.module.json`, `server/index.js`, `web/index.js`
- [ ] `source: "upload"`, `sdkVersion` is supported by host
- [ ] Handlers use `hostFetch` only
- [ ] UI calls `/api/m/<id>/…`
- [ ] Optional MCP local names match `mcpTools` in the manifest
- [ ] Optional `actions` use unique local `id`s and paths under `/m/<id>`
- [ ] Upload works; nav, CMD+K actions, and MCP toggles behave as expected

## Related

- [FOR AI — module brief](module-brief-for-ai.md)
- [MCP](mcp.md)
- [How modules work](architecture-modules.md)

## Place-detail sections and durable data (SDK 1)

Declare `sdkVersion: "1.0.0"` and `requiredCapabilities: ["place-sections", "persistent-data"]`
when using both features. SDK 0 hosts reject the SDK major before installing; new hosts
also validate required capabilities at install and load time. Existing SDK 0 modules
continue to load on SDK 1 hosts.

Add `placeSections: [{ "id": "details", "label": "Details", "exportName": "PlaceSection" }]`
to the manifest. Export a React component taking `ModulePlaceSectionContext`
(`placeId`, `category`, `isOwner`). The host loads it after place information, using the
same visibility preference as navigation, with independent loading and render-error
handling. A section-only module can declare empty `nav` and `webRoutes` arrays.
Treat `isOwner` as a presentation hint; validate access through the authenticated host
place API on every server operation. MCP `hostFetch` supports authenticated place
reads as well as search. Nested MCP JSON Schemas are preserved for discovery.

HTTP and MCP contexts include `dataDir`, located at `<modules volume>/.data/<moduleId>`.
Create this directory before writing. It is outside the plugin assets route and survives
updates, disabling, uninstall, and reinstall. The host does not currently purge retained
module data automatically; an operator can remove the specific data directory while the
module is uninstalled. Back up the entire modules volume, including hidden directories,
with writers stopped. Personal library exports do not include module-private data.
