# Architecture — Core vs modules

Placard is built as a **stable core** plus **modules** that should not tangle with core internals. Long-term goal: third parties (or you, later) can ship modules without forking the core.

## Mental model

```
┌──────────────────────────────────────────────┐
│  Modules (first-party + future third-party)  │
│  restaurants.decide · restaurants.vote · …   │
├──────────────────────────────────────────────┤
│  Module SDK / contract (versioned)           │
├──────────────────────────────────────────────┤
│  Core API (HTTP) + events / hooks            │
├──────────────────────────────────────────────┤
│  Core domain: places, tags, lists, media,    │
│  enrichment, users, household, auth          │
└──────────────────────────────────────────────┘
```

**Core** owns identity, privacy, place data, enrichment pipeline, MCP transport + core tools, and the shell UI (library, cards, settings).

**Modules** own specialized UX and workflows (Decide wheel, dinner vote, later hotel tools, …). They expose HTTP under `/api/m/<id>/*` and optional MCP tools via `createModule()`; they call host APIs through `hostFetch`, not by reaching into core SQL.

## Design rules

1. **Core does not hard-wire module features.** Catalog lists bundled packages; runtime loads `createModule` like uploads. No Decide-specific MCP/HTTP in the host.
2. **Modules do not patch core tables casually.** Prefer module-owned storage (JSON under the module root / namespaced tables) plus references to core IDs (`place_id`, `list_id`, …).
3. **HTTP and MCP share one implementation** inside the module (`createHttpApp` + `mcpTools` calling the same helpers).
4. **Household gating stays in core.** Modules declare capabilities (`requires: household`); core hides them in solo mode.
5. **Failure isolation.** A broken module must not take down the library. Disable/uninstall without data loss in core. Per-user **MCP kill switch** (`user_module_prefs.mcp_enabled`) hides that module’s tools without uninstalling.
6. **Permissions.** Module actions respect the same authz as the UI (user / household member); MCP tools also respect instance enable + MCP pref.

## What the core exposes (contract sketch)

Not implementation — a target surface modules rely on:

| Area | Examples |
| --- | --- |
| Places | list/get/create/update; filter by type, tag, list, bbox, open-now |
| Lists / tags | CRUD; resolve members |
| Media | attach/list images for a place (incl. dish albums as typed attachments or module data) |
| Enrichment | read facts (hours, cuisine); request refresh |
| Household | “am I in household mode?”; list members (for vote modules) |
| Navigation helpers | deep-link payloads for external maps |

Modules may also register:

- **Routes / pages** in the UI shell (nav item, place-detail tabs)
- **Actions** (“Decide from this list”)
- **MCP tools** (optional; see [mcp.md](mcp.md))

## First-party modules (planned)

| Module ID | Depends on | Notes |
| --- | --- | --- |
| `restaurants.decide` | places, hours facts | Solo-friendly wheel |
| `restaurants.vote` | places + household | Hidden without household |
| `restaurants.dishes` | places + media | Dish memories on cards |

Detail: [modules-restaurants.md](modules-restaurants.md).

**Authoring guide:** [creating-modules.md](creating-modules.md) — step-by-step, with a generic “Pick any category” example.

## Trusted plugins (current)

Placard ships a **Module SDK** (`@placard/module-sdk`) and a self-hosted **marketplace UI**:

- **Catalog** — curated first-party (and later remote) manifests of installable plugins
- **Instance install** — admin installs/uninstalls; `instance_modules` + instance enable kill switch
- **Per-user show** — `user_module_prefs.visible`; shell nav/routes come from `GET /api/modules/me`
- **Runtime** — trusted **same-process** JS (no sandbox yet). Bundled reference: `@placard/module-restaurants-decide` (Decide) loads via the same `createModule` path as uploads
- **Host contract** — plugins use `hostFetch` (e.g. `/api/search`) and optional `mcpTools`; never core SQL helpers
- **MCP** — host registers tools from `LoadedPlugin.mcpTools` under a **module-prefixed** global name (`moduleMcpToolName`); Settings lists those names and toggles `mcp_enabled` per module

**Phase C-lite (shipped):** admins upload a **prebuilt zip** into `PLACARD_MODULES_DIR` (Compose `modules` volume). The host extracts, registers `instance_modules` (`source: upload`), dynamic-imports the server entry, and serves web assets + optional `/api/m/<id>/*` HTTP. No in-container TypeScript compile; authors build against `@placard/module-sdk` on their machine. See [creating-modules.md](creating-modules.md#distribute--packaging-for-docker-prebuilt-zip).

This is a **self-hosted plugin catalog**, not a consumer SaaS app store.

## Anti-patterns

- Hard-coding restaurant vote tables into core migrations “just this once”
- Modules calling undocumented SQL
- Core UI full of `if (restaurant)` special cases that belong in a module slot
- MCP tools hard-coded in the host for a specific module
- MCP tools that bypass module/core auth or the per-module MCP pref

## Phasing

| Phase | What we deliver |
| --- | --- |
| A | Core library + search; restaurant modules behind clear boundaries |
| B | Module SDK + manifest; registry; instance install; per-user visibility; marketplace UI |
| C-lite | Prebuilt zip upload into `PLACARD_MODULES_DIR`; asset + `/api/m/*` routes; marketplace upload UI |
| C | Optional remote catalog URL; permission prompts; later sandbox; npm install path |

**Decision:** Phase B + C-lite are in tree (Decide bundled; third-party via trusted admin zip upload). Full Phase C hardens trust UX without requiring a public store.
