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
2. Implements **server** logic using host contracts (`ModuleHostSearch`, …) — not core SQL internals
3. Exposes **HTTP** via an `HttpApiGroup` on the shared `Api` (first-party) or a documented host hook
4. Provides a **web page** registered in the client module registry
5. Owns any **extra tables** (e.g. pick history) via a Drizzle migration

Folders:

```
packages/module-sdk/                      # SDK: manifest types, ModuleHostSearch
packages/modules/<your-module>/           # Your plugin package
apps/server/src/modules/catalog.ts        # Add your manifest to the catalog
apps/server/src/http/                     # Wire HttpApiLive + Layer
apps/web/src/modules/registry.ts          # Map exportName → React page
apps/web/src/pages/<your-page>.tsx        # UI (first-party; uses app `@/` UI kit)
```

Route convention: **`/m/<module.id>`** (e.g. `/m/places.pick`) so core routes stay free.

Module settings: Marketplace card → **Settings** → **`/settings/modules/<module.id>`**. Today that page toggles “show in nav”; later modules can declare extra options (home widgets, enrichment hooks, uploaded `settingsExport`, etc.) on the same route.

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
| [`packages/modules/restaurants-decide/placard.module.json`](../packages/modules/restaurants-decide/placard.module.json) | Manifest shape |
| [`packages/modules/restaurants-decide/src/server/decide.ts`](../packages/modules/restaurants-decide/src/server/decide.ts) | Pool + avoid-recent + `ModuleHostSearch` |
| [`apps/web/src/pages/decide-page.tsx`](../apps/web/src/pages/decide-page.tsx) | Spin UI + filters |
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

## Step 3 — Domain types + HTTP contract

First-party modules still declare schemas on `@placard/domain` so the typed `HttpApiClient` and OpenAPI stay unified.

1. Add something like `packages/domain/src/pick.ts`:

```ts
export const PickRequest = Schema.Struct({
  ...SearchFilter.fields,       // text, category?, open?, near?, radiusKm?, tag?, list?, status?
  avoidRecent: Schema.Boolean,
})
// category optional → “any type”; when set, Search filters to that PlaceCategory

export const PickPreview = Schema.Struct({ count: Schema.Number })
export const PickResult = Schema.Struct({ place: Place })
export class PickPoolEmpty extends Schema.TaggedError<PickPoolEmpty>()(/* … */) {}
```

Reuse `SearchFilter` fields; do **not** force `category` in the schema.

2. Add `PickApi` on `Api` in `packages/domain/src/api.ts`:

- `POST /api/pick/preview`
- `POST /api/pick/spin`
- Errors: `PickPoolEmpty`, `ModuleDisabled`

3. Export from `packages/domain/src/index.ts`.

`restaurants.decide` forced category in the **service**. For Pick, pass the user’s category through to `ModuleHostSearch.query` unchanged (omit or set `category` on the filter).

---

## Step 4 — Server service (host contracts only)

In `packages/modules/places-pick/src/server/pick.ts`:

1. Depend on **`ModuleHostSearch`** from `@placard/module-sdk` — never import `apps/server/src/places/search.ts`.
2. Build the pool:

```ts
const hits = yield* search.query(ownerId, {
  ...filterWithoutAvoidRecent,
  // category already on the request when the user picked one
})
```

3. If `avoidRecent`, load recent place ids from **your** table (e.g. `pick_picks`) and filter with the same `excludeRecent` helper pattern as Decide.
4. Pick with `Random.nextIntBetween(0, hits.length, { halfOpen: true })`.
5. Insert a pick row; return `{ place }`.

**Module-owned table** (migration under `apps/server/drizzle/…`):

| Column | Notes |
| --- | --- |
| `id`, `owner_id`, `place_id`, `picked_at` | Same shape as `decide_picks` |
| Optional `category` | Useful if you want “avoid recent parks” vs global avoid |

Document in [data-model.md](data-model.md) that core must not read this table.

Wire the Layer in the host like Decide:

```ts
// apps/server — map core Search → ModuleHostSearch, then provide Pick.layer
Pick.layer.pipe(
  Layer.provide(ModuleHostSearchLive),
  Layer.provide(Search.layer),
)
```

See [`apps/server/src/modules/host-search.ts`](../apps/server/src/modules/host-search.ts) and [`apps/server/src/http/api.ts`](../apps/server/src/http/api.ts).

---

## Step 5 — HTTP handlers + module gate

`apps/server/src/http/pick.ts` (mirror `decide.ts`):

1. `HttpApiBuilder.group(Api, "pick", …)` calling your service.
2. Before preview/spin, ensure the module is **instance-enabled** and **visible for this user**:

```ts
// same pattern as Decide: query instance_modules + user_module_prefs
// or call Modules.isAvailableToUser(ownerId, PLACES_PICK_ID)
if (!ok) return yield* new ModuleDisabled({ message: "…" })
```

3. Register `PickApiLive` in `ApiLive` and merge `PickLive` into `ServicesLayer`.

---

## Step 6 — Web UI

1. Add `apps/web/src/pages/pick-page.tsx` (Vinyl / existing shell tokens).

Suggested controls (one composition, not a dashboard):

- **Category** — select: Any / Restaurant / Cafe / Park / … (`placeCategories` from `@placard/domain`)
- **Pool** — All | List | Tag (same as Decide)
- **Open tonight** / **Open now**
- **Near me** + radius (`requestLocation`)
- **Avoid recent**
- Preview count via `POST /api/pick/preview`
- **Choose for me** → spin → result + maps links

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

## Step 7 — Catalog + seed install

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

## Step 8 — Verify

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
- [ ] Manifest id, nav path `/m/…`, `webRoutes.exportName`
- [ ] Domain schemas + `HttpApiGroup` on `Api`
- [ ] Server Layer uses **host** tags only (`ModuleHostSearch`, …)
- [ ] Module-owned tables + migration; documented as module-owned
- [ ] Http handlers + `ModuleDisabled` when not available to user
- [ ] Web page + entry in `apps/web/src/modules/registry.ts`
- [ ] Manifest listed in `apps/server/src/modules/catalog.ts`
- [ ] Server `package.json` workspace dependency
- [ ] Tests: unit + availability integration
- [ ] Docs: one line in [modules-restaurants.md](modules-restaurants.md) or a sibling module doc if it’s a new family

---

## Rules of thumb

1. **Core does not special-case your feature in Library chrome.** Nav comes from the registry.
2. **Reuse `SearchFilter` / `Search.query`** for geography, open-now, tags, lists — don’t reimplement PostGIS.
3. **Avoid-recent is module data**, not a core places column.
4. **Same spin API for MCP later** — keep request/result schemas in domain so Phase 9 can register `pick_place` from the same service.
5. **Trusted code** — bundled and uploaded modules run in-process. Admin zip upload is trusted; no sandbox yet.

---

## Distribute — packaging for Docker (prebuilt zip)

Compose/Coolify instances only have the image + volumes. They cannot rebuild the monorepo. Ship a **prebuilt zip** and upload it in **Settings → Module marketplace**.

### Zip layout

```
placard.module.json          # required
server/
  index.js                   # ESM; export createModule() → { createHttpApp? }
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
4. Custom HTTP (optional): export `createHttpApp` from `createModule()`; host mounts it at **`/api/m/<id>/*`** (session auth; not typed OpenAPI). First-party bundled modules may keep typed `HttpApiGroup`s.

**Unload:** disabling an uploaded module stops routing when handlers check `enabled`; fully dropping a prior `import()` graph may need a **container restart**. Prefer disable-without-delete as a kill switch.

Uploaded pages are **not** listed in `apps/web/src/modules/registry.ts` — the shell uses `webEntryUrl` from `GET /api/modules/me` and `PluginPageHost`.

---

## What this pass does *not* cover

- Publishing to a public npm marketplace (catalog can stay in-repo or a future `PLACARD_MODULE_CATALOG_URL`)
- In-container TypeScript compile of raw plugin sources
- Hot-reload without restart for dropping `import()` graphs
- Sandboxed / unsigned plugins

The **manifest + host contracts + install/visibility** steps above stay the same whether the package is bundled or uploaded.
