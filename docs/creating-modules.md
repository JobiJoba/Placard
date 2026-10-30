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

Richer example: **`places.pick`** — generic “pick any category” wheel in sibling repo [`placard-places-pick`](https://github.com/JobiJoba/placard-places-pick) (next to this monorepo as `../placard-places-pick`). Install via zip upload or GitHub Release.

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
  "nav": [{ "path": "/m/places.pick", "label": "Pick", "slot": "primary" }],
  "source": "upload",
  "sdkVersion": "0.1.0",
  "serverEntry": "./server/index.js",
  "webEntry": "./web/index.js",
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
- `sdkVersion` major must match the host (`0.1.0` today)
- Nav path and API prefix use the same id: `/m/<id>`, `/api/m/<id>/*`
- Optional `actions` appear in **CMD+K → Actions** and navigate to `path` when selected (same visibility gate as `nav`)

## Server entry

Export `createModule()` that returns optional `createHttpApp` and/or `mcpTools`.

- Call the host with `ctx.hostFetch` (e.g. `POST /api/search`) — **never** core SQL
- Persist module-private data under `ctx.rootDir` (Compose volume `modules`)
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
- Upload / GitHub wheel: sibling repo `placard-places-pick` (next to this monorepo)

## Install on an instance

1. Admin → **Settings → Module marketplace → Choose .zip**, **or** paste a public GitHub repo URL / `owner/repo`
2. For GitHub: publish a **Release** whose asset is the prebuilt plugin (prefer `*.placard-module`, else a clear `.zip` — not a source archive)
3. Placard extracts to `PLACARD_MODULES_DIR/<id>/` (Compose volume `modules`)
4. Enable the module for the instance
5. Each user: Marketplace → module → **Settings** → show in nav / allow MCP

After install, module tools appear under **Settings → MCP** with their global names. GitHub-sourced modules show an update badge when a newer Release is available.

## Checklist

- [ ] Zip has `placard.module.json`, `server/index.js`, `web/index.js`
- [ ] `source: "upload"`, `sdkVersion` major matches host
- [ ] Handlers use `hostFetch` only
- [ ] UI calls `/api/m/<id>/…`
- [ ] Optional MCP local names match `mcpTools` in the manifest
- [ ] Optional `actions` use unique local `id`s and paths under `/m/<id>`
- [ ] Upload works; nav, CMD+K actions, and MCP toggles behave as expected

## Related

- [FOR AI — module brief](module-brief-for-ai.md)
- [MCP](mcp.md)
- [How modules work](architecture-modules.md)
