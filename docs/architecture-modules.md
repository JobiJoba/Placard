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

**Core** owns identity, privacy, place data, enrichment pipeline, and the shell UI (library, cards, settings).

**Modules** own specialized UX and workflows (Decide wheel, dinner vote, later hotel tools, …). They read/write through the **public contract**, not by reaching into the database schema ad hoc.

## Design rules

1. **Core does not import module code.** Modules register themselves; core discovers them.
2. **Modules do not patch core tables casually.** Prefer module-owned storage (namespaced tables / JSON docs) plus references to core IDs (`place_id`, `list_id`, …).
3. **Everything a module needs goes through a versioned API** (same surface MCP and the web UI ideally share).
4. **Household gating stays in core.** Modules declare capabilities (`requires: household`); core hides them in solo mode.
5. **Failure isolation.** A broken module must not take down the library. Disable/uninstall without data loss in core.
6. **Permissions.** Module actions respect the same authz as the UI (user / household member).

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
- **Runtime** — trusted **same-process** JS (no sandbox yet). Bundled reference: `@placard/module-restaurants-decide` (Decide)
- **Host contract** — plugins use `ModuleHostSearch` (and future host tags), never core SQL helpers

**Phase C-lite (shipped):** admins upload a **prebuilt zip** into `PLACARD_MODULES_DIR` (Compose `modules` volume). The host extracts, registers `instance_modules` (`source: upload`), dynamic-imports the server entry, and serves web assets + optional `/api/m/<id>/*` HTTP. No in-container TypeScript compile; authors build against `@placard/module-sdk` on their machine. See [creating-modules.md](creating-modules.md#distribute--packaging-for-docker-prebuilt-zip).

This is a **self-hosted plugin catalog**, not a consumer SaaS app store.

## Anti-patterns

- Hard-coding restaurant vote tables into core migrations “just this once”
- Modules calling undocumented SQL
- Core UI full of `if (restaurant)` special cases that belong in a module slot
- MCP tools that bypass module/core auth

## Phasing

| Phase | What we deliver |
| --- | --- |
| A | Core library + search; restaurant modules behind clear boundaries |
| B | Module SDK + manifest; registry; instance install; per-user visibility; marketplace UI |
| C-lite | Prebuilt zip upload into `PLACARD_MODULES_DIR`; asset + `/api/m/*` routes; marketplace upload UI |
| C | Optional remote catalog URL; permission prompts; later sandbox; npm install path |

**Decision:** Phase B + C-lite are in tree (Decide bundled; third-party via trusted admin zip upload). Full Phase C hardens trust UX without requiring a public store.
