# Creating a Placard module

How to ship a **trusted plugin** for Placard: manifest, server logic, UI, catalog registration, and install/visibility.

Architecture background: [architecture-modules.md](architecture-modules.md). Reference implementation: `@placard/module-restaurants-decide` (restaurant-only Decide).

This guide walks a **generic Pick** module — same idea as Decide, but the user chooses a **place category** (restaurant, park, cafe, …) and then applies the usual filters (open now/tonight, near me, list/tag, avoid recent).

---

## What a module is today

| Layer | Responsibility |
| --- | --- |
| **Catalog** | Declares what *can* be installed (`placard.module.json` + host catalog list) |
| **Instance** | Admin installs/uninstalls; `instance_modules` + enable kill switch |
| **User** | Nav visibility and other prefs live on the module’s settings page (`/settings/modules/<id>`), opened from Marketplace → **Settings** on an installed card |
| **Runtime** | Trusted **same-process** JS; first-party modules are **bundled**, or third-party via **prebuilt zip** on the modules volume |

You are writing a first-party (or third-party prebuilt) package that:

1. Declares a **manifest**
2. Implements **server** logic in `createModule()` — HTTP via `createHttpApp`, optional MCP via `mcpTools`
3. Calls host APIs through `hostFetch` (e.g. `POST /api/search`) — not core SQL internals
4. Provides a **web page** (bundled registry export or uploaded `webEntryUrl`)
5. Owns module data under the module root (e.g. `data/picks.json`) — not host Effect groups

Folders:

```
packages/module-sdk/                      # SDK: manifest, createModule, ModuleMcpContext
packages/modules/<your-module>/           # Your plugin package (plugin/src/server/create-module.ts)
apps/server/src/modules/catalog.ts        # Bundled listing only (not HTTP/MCP special-casing)
apps/web/src/modules/registry.ts          # Optional first-party exportName → React page
apps/web/src/pages/<your-page>.tsx        # UI (calls /api/m/<id>/…; uses app `@/` UI kit)
```

Route convention: **`/m/<module.id>`** (UI) and **`/api/m/<module.id>/*`** (plugin HTTP) so core routes stay free.

Module settings: Marketplace card → **Settings** → **`/settings/modules/<module.id>`**. That page toggles nav visibility and **Allow MCP for this module** (lists declared tool names; kill switch is per-module, not per-tool).

**MCP:** Core tools live at `/mcp` (bearer PAT). Module tools come from `createModule().mcpTools` on every loaded plugin; the host registers them when the instance is enabled, the user can use the module, and `user_module_prefs.mcp_enabled` is true. Declare the same **local** tool defs on the manifest (`mcpTools`) so Settings can list them without executing handlers.

**Tool name uniqueness:** You only need a local name unique **inside your module** (e.g. `pick_place`). The host prefixes with the module id at registration — `places.pick` + `pick_place` → MCP name `places_pick__pick_place` — so authors need not coordinate globally. Do not invent your own prefix; Settings and agents use the host global name. See [mcp.md](mcp.md).

---

## Example: `places.pick` (generic Decide)

**Product**

- Pool: places of a **chosen category** (or “any”), optionally limited to a list/tag
- Filters: open now / open tonight, near me + radius, avoid recent picks (14 days)
- Action: **Choose for me** → spin → one place card

**Module id:** `places.pick`  
**Package:** `@placard/module-places-pick`  
**Nav label:** Pick  
**Path:** `/m/places.pick`

Compared to `restaurants.decide`: do **not** hardcode `category: "restaurant"`; take `category` from the request (optional = all categories).

---

## Step 0 — Read the reference

Skim these before copying:

| File | Why |
| --- | --- |
| [`packages/modules/restaurants-decide/placard.module.json`](../packages/modules/restaurants-decide/placard.module.json) | Manifest shape + `mcpTools` |
| [`packages/modules/restaurants-decide/plugin/src/server/create-module.ts`](../packages/modules/restaurants-decide/plugin/src/server/create-module.ts) | `createHttpApp` + `mcpTools` + `hostFetch` |
| [`apps/web/src/pages/decide-page.tsx`](../apps/web/src/pages/decide-page.tsx) | Spin UI → `/api/m/restaurants.decide/*` |
| [`apps/server/src/modules/catalog.ts`](../apps/server/src/modules/catalog.ts) | Catalog registration |
| [`apps/web/src/modules/registry.ts`](../apps/web/src/modules/registry.ts) | Web export map |

---

## Step 1 — Scaffold the package

1. Create `packages/modules/places-pick/` (workspace already includes `packages/modules/*`).

2. `package.json`:

```json
{
  "name": "@placard/module-places-pick",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./server": "./src/server/index.ts",
    "./manifest": "./src/manifest.ts"
  },
  "dependencies": {
    "@placard/domain": "workspace:*",
    "@placard/module-sdk": "workspace:*",
    "effect": "4.0.6",
    "uuid": "^14.0.3"
  }
}
```

3. Add a `tsconfig.json` that extends the repo base (copy from `restaurants-decide`).

4. From the repo root: `pnpm install`, then depend on the package from the server:

```json
"@placard/module-places-pick": "workspace:*"
```

in [`apps/server/package.json`](../apps/server/package.json).

---

## Step 2 — Write `placard.module.json`

```json
{
  "id": "places.pick",
  "name": "Pick",
  "version": "0.1.0",
  "description": "Spin one place from your library — any category, open now, near you, or surprise me.",
  "permissions": ["places.read", "search.query"],
  "nav": [
    {
      "path": "/m/places.pick",
      "label": "Pick",
      "slot": "primary"
    }
  ],
  "source": "bundled",
  "packageName": "@placard/module-places-pick",
  "webRoutes": [
    {
      "path": "/m/places.pick",
      "exportName": "PickPage"
    }
  ]
}
```

Rules:

- **`id`** is stable forever (install rows key on it). Use `family.feature` (`places.pick`, `restaurants.decide`).
- **`permissions`** must be from the SDK list (`places.read`, `search.query`, `media.read` today).
- **`webRoutes.exportName`** must match the key you register in `apps/web/src/modules/registry.ts`.
- **`slot`**: `primary` (main nav / mobile bar) or `more` (overflow).

Export a typed manifest:

```ts
// packages/modules/places-pick/src/manifest.ts
import { defineModule } from "@placard/module-sdk"
import raw from "../placard.module.json" with { type: "json" }

export const placesPickManifest = defineModule({ /* …from raw… */ })
export const PLACES_PICK_ID = placesPickManifest.id
```

---

## Step 3 — Request shapes (JSON, not host HttpApi)

Keep request/response shapes in the module (or shared domain helpers if the web UI needs them). Prefer plain JSON Schema for MCP `inputSchema`.

Decide forces `category: "restaurant"` inside the plugin. For Pick, accept an optional `category` on the body and pass it through to `hostFetch("/api/search", …)`.

Do **not** add a host `HttpApiGroup` for module endpoints — mount everything under `/api/m/<id>/*` via `createHttpApp`.

---

## Step 4 — `createModule()` (HTTP + optional MCP)

In `plugin/src/server/create-module.ts` (or pack `server/index.js`):

1. Export `createModule()` returning `{ createHttpApp, mcpTools? }` from `@placard/module-sdk`.
2. In handlers, call **`ctx.hostFetch("/api/search", { method: "POST", body: JSON.stringify(filter) })`** — never import `apps/server` search/SQL.
3. Persist avoid-recent under the module root (e.g. `data/picks.json`), not a host table.
4. Share one `spinOnce` helper between HTTP `POST …/spin` and the MCP tool handler.
5. Declare the same **local** tool names on the manifest `mcpTools` array for Settings (host will show the prefixed global name).

```ts
export function createModule() {
  return {
    createHttpApp: async (request, ctx) => { /* preview / spin */ },
    mcpTools: [
      {
        // Local name only — clients call places_pick__pick_place
        def: { name: "pick_place", description: "…", inputSchema: { type: "object", properties: { … } } },
        handler: async (args, ctx) => {
          const result = await spinOnce(ctx.hostFetch, ctx.rootDir, ctx.ownerId, args)
          return result.ok ? { ok: true, data: result } : { ok: false, error: result.message }
        },
      },
    ],
  }
}
```

The host mounts HTTP at **`/api/m/<id>/*`** (session cookie) and registers `mcpTools` on `/mcp` as `{sanitized_module_id}__{local_name}` when MCP is allowed for that user+module.

---

## Step 5 — Web UI

1. Add `apps/web/src/pages/pick-page.tsx` (Vinyl / existing shell tokens).

Suggested controls (one composition, not a dashboard):

- **Category** — select: Any / Restaurant / Cafe / Park / … (`placeCategories` from `@placard/domain`)
- **Pool** — All | List | Tag (same as Decide)
- **Open tonight** / **Open now**
- **Near me** + radius (`requestLocation`)
- **Avoid recent**
- Preview count via `POST /api/m/places.pick/preview`
- **Choose for me** → `POST /api/m/places.pick/spin` → result + maps links

2. Register the page:

```ts
// apps/web/src/modules/registry.ts
import { PickPage } from "@/pages/pick-page"

export const bundledModulePages = {
  DecidePage,
  PickPage, // exportName in placard.module.json
}
```

The shell mounts routes from `GET /api/modules/me` automatically — do **not** hardcode `/m/places.pick` in `App.tsx` primary nav.

---

## Step 6 — Catalog + seed install

1. Add the manifest to the host catalog:

```ts
// apps/server/src/modules/catalog.ts
import { placesPickManifest } from "@placard/module-places-pick/manifest"

export const bundledCatalog = [restaurantsDecideManifest, placesPickManifest]
```

2. Optional migration seed (so new instances get it installed like Decide):

```sql
INSERT INTO instance_modules (module_id, version, source, package_name, enabled)
VALUES ('places.pick', '0.1.0', 'bundled', '@placard/module-places-pick', true);
```

Without a seed, admins install it from **Settings → Module marketplace**.

3. Run migrations / restart Aspire.

---

## Step 7 — Verify

**As admin**

1. Settings → Module marketplace → catalog shows **Pick** → Install (if not seeded).
2. Instance Enable stays on.

**As any user**

1. Settings → Marketplace → **Pick** → **Settings** → **Shown in nav**.
2. Open **Pick** → choose category `park` → optional Near me → Choose for me.
3. Hide the module on its settings page → nav entry gone; `/api/pick/spin` returns `ModuleDisabled`.

**Automated (recommended)**

- Unit: pool respects category; avoid-recent excludes ids.
- Architecture: package does not import `places/search.ts` / place SQL helpers.
- Integration: install → me has nav; hide → spin disabled; uninstall → gone.

---

## Checklist (copy for each new module)

- [ ] Package under `packages/modules/<name>/` with `placard.module.json`
- [ ] Manifest id, nav path `/m/…`, `webRoutes` / `webEntry`; optional `mcpTools` defs
- [ ] `createModule()` with `createHttpApp` and optional `mcpTools` (names match manifest)
- [ ] Handlers use `hostFetch` for search/places — no host SQL
- [ ] Module-owned data under module root (or documented module storage)
- [ ] Web page calls `/api/m/<id>/…` (+ bundled registry entry if first-party)
- [ ] Manifest listed in `apps/server/src/modules/catalog.ts` when bundled
- [ ] Server `package.json` workspace dependency (bundled)
- [ ] Tests: unit + `/api/m/…` + MCP list/call when tools ship
- [ ] Docs: one line in [modules-restaurants.md](modules-restaurants.md) or a sibling module doc if it’s a new family

---

## Rules of thumb

1. **Core does not special-case your feature in Library chrome.** Nav comes from the registry.
2. **Reuse host `POST /api/search`** via `hostFetch` for geography, open-now, tags, lists — don’t reimplement PostGIS.
3. **Avoid-recent is module data**, not a core places column.
4. **Same spin helper for HTTP and MCP** — one implementation, two entry points.
5. **Trusted code** — bundled and uploaded modules run in-process. Admin zip upload is trusted; no sandbox yet.

---

## Distribute — packaging for Docker (prebuilt zip)

Compose/Coolify instances only have the image + volumes. They cannot rebuild the monorepo. Ship a **prebuilt zip** and upload it in **Settings → Module marketplace**.

### Zip layout

```
placard.module.json          # required
server/
  index.js                   # ESM; export createModule() → { createHttpApp?, mcpTools? }
web/
  index.js                   # browser ESM exporting page components
  assets/…                   # optional
README.md                    # optional
```

Manifest fields for packs (backwards compatible; bundled Decide already sets them):

| Field | Default | Meaning |
| --- | --- | --- |
| `serverEntry` | `./server/index.js` | Server ESM entry inside the zip |
| `webEntry` | `./web/index.js` | Browser ESM entry (served as `/api/modules/<id>/assets/…`) |
| `sdkVersion` | (optional for bundled) | Semver of `@placard/module-sdk`; **major must match** the host |
| `icon` | (optional) | Square icon: `/…` or `https://…`, or relative path in the zip |
| `cover` | (optional) | Marketplace card hero image — same URL rules as `icon` |

Marketplace cards show **Preinstalled** (`bundled`) vs **Uploaded** badges, description, and cover (or a styled placeholder when `cover` is omitted). Relative `icon`/`cover` paths on uploads are served from `/api/modules/<id>/assets/…`. Bundled modules should use root-relative public URLs (e.g. `/module-covers/decide.svg`).

Set `"source": "upload"` in the packed manifest (the host also records `instance_modules.source = upload`).

### Peer / external rule

Plugin **server** code must treat these as **externals** provided by the Placard process — do **not** nest Effect/`@placard/*` `node_modules` inside the zip for v1:

- `effect`
- `@placard/domain`
- `@placard/module-sdk`

Example esbuild:

```bash
esbuild src/server/pack-entry.ts --bundle --format=esm --platform=node \
  --external:effect --external:@placard/domain --external:@placard/module-sdk \
  --outfile=pack/server/index.js
```

Browser entry: bundle for the browser; page components are loaded by `PluginPageHost` via dynamic `import()` of the asset URL (no Vite rebuild of the host image).

### Pack script

From the repo root, after building into a pack directory that already has the layout above:

```bash
pnpm placard:pack ./path/to/pack
# → writes <id>-<version>.zip next to the pack dir
```

### Upload & runtime

1. Admin: Settings → Module marketplace → **Choose .zip**
2. Host extracts to `PLACARD_MODULES_DIR/<module.id>/` (Compose volume `modules` → `/data/modules`)
3. Upserts `instance_modules`, dynamic-imports `serverEntry`, serves web under `/api/modules/<id>/assets/*`
4. Custom HTTP / MCP (optional): export `createHttpApp` and/or `mcpTools` from `createModule()`. HTTP mounts at **`/api/m/<id>/*`** (session auth). MCP tools register on `/mcp` when the user’s module MCP pref is on.

**Unload:** disabling an uploaded module stops routing when handlers check `enabled`; fully dropping a prior `import()` graph may need a **container restart**. Prefer disable-without-delete as a kill switch.

Uploaded pages are **not** listed in `apps/web/src/modules/registry.ts` — the shell uses `webEntryUrl` from `GET /api/modules/me` and `PluginPageHost`.

---

## What this pass does *not* cover

- Publishing to a public npm marketplace (catalog can stay in-repo or a future `PLACARD_MODULE_CATALOG_URL`)
- In-container TypeScript compile of raw plugin sources
- Hot-reload without restart for dropping `import()` graphs
- Sandboxed / unsigned plugins

The **manifest + host contracts + install/visibility** steps above stay the same whether the package is bundled or uploaded.
