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

## Third-party modules (future)

Ambition, not day-one delivery:

- Install from a package / folder / URL (signed or “I trust this zip”)
- Declared manifest: id, version, core API version range, capabilities, permissions requested
- Sandbox expectations TBD (start simple: same process, reviewed code; harden later)

Until that exists, write first-party modules **as if** they were external: same SDK, no special core privileges. That keeps the door open.

## Anti-patterns

- Hard-coding restaurant vote tables into core migrations “just this once”
- Modules calling undocumented SQL
- Core UI full of `if (restaurant)` special cases that belong in a module slot
- MCP tools that bypass module/core auth

## Phasing

| Phase | What we deliver |
| --- | --- |
| A | Core library + search; restaurant modules **in-repo** behind clear boundaries; MCP tools registered |
| B | Formal Module SDK + manifest; first-party modules load via registry |
| C | Documented third-party install path + permission prompts |

**Decision:** ship **in-repo modules only** first. Do not block MVP on phase C. **Do** avoid painting ourselves into a monolith that cannot split later.
