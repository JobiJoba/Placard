# Product overview

Shape of **Placard**: objects, modes, and flows. Binding v0.1 scope: [mvp.md](mvp.md). Progress vs idea: [current-state.md](current-state.md).

Resolved choices: [decisions.md](decisions.md).  
First-user priorities: [first-user.md](first-user.md).  
Restaurant tools: [modules-restaurants.md](modules-restaurants.md).  
Core vs modules: [architecture-modules.md](architecture-modules.md).  
MCP: [mcp.md](mcp.md).  
Deploy: [deployment.md](deployment.md).

## Modes: single user vs household

| Mode | Status | Who | What you see |
| --- | --- | --- | --- |
| **Solo chrome** (default) | **Shipped** | Multi-user accounts; each private library | Library, tags, lists, enrichment, **search**, restaurant **Decide**, dish photos, **MCP**. No voting chrome. |
| **Household** (opt-in) | **Planned (v0.2)** | Multiple full members; **admin invites only** | Shared *and* **private** places; dinner **votes** (in-app only); optional dish attribution. No guest/kid seats. |

Household will unlock features; it will not force every place to be shared. Today only `private` visibility is allowed.

Privacy: never public on the internet. Visibility = private to a user, or (later) shared within the household.

---

## Objects

### Place

Atomic unit: name, lat/lon, type, timestamps.

**First-class status:** at least **want to go** vs **been there** (visited).

Also common: notes, phone, website, price, cuisine, hours, cover, Google Place ID.

**Visibility** (household): `private` | `household` (or equivalent).

### Tag / List

Tags = attributes. Lists = playlists. Order optional.

### Dish memory

Photos + optional dish name/note/date on a restaurant. Independent of visit history.

### Visit (optional)

Separate record: “I went” / dates — **not** required to upload dishes.

### Enrichment fact

Provenance + `fetched_at`. User overrides win. Instance Google key by default; optional per-member key override. **Force refresh** action re-fetches; no silent mass cron.

### Module session

Decide spins, dinner votes, etc.

---

## Views (routes today)

| View | Route | Notes |
| --- | --- | --- |
| Library (cards / map) | `/` | Near me / City (autocomplete) / All |
| Add place | `/add` | Autocomplete, Google map, OSM pin |
| Place detail | `/places/:id` | Facts, media, cover, maps links |
| Lists | `/lists` | |
| Import | `/import`, `/import/:runId` | Triage + Needs review |
| Recently deleted | `/deleted` | |
| Decide | `/m/restaurants.decide` | Marketplace module |
| Settings | `/settings/general\|mcp\|marketplace\|…` | Side-nav |

### Search / filter — **core product**

Beat Google Maps Saved search. Structured filters first (text, category, open now/tonight, radius, tag, list, status). Later: optional **local LLM** → same filter AST ([first-user.md](first-user.md)). Agents already drive filters via MCP.

### Modules

**Decide** ships as a trusted Marketplace plugin + MCP tool. Dish photos live in core media. **Vote** waits on household (v0.2).

---

## Primary user flows

### A. Import (must)

Takeout upload → **free triage** (keep/skip by list, date, area, text; no API calls) → import kept entries → match + enrich with instance key → confirm the few that didn't match. Anything can be removed afterwards (single, bulk, or undo a whole import). Details in [mvp.md](mvp.md).

### A2. Manual add (must)

"Add place" page:

- **Autocomplete**: type a name, pick a Google Places suggestion, preview, save
- **Map picker**: click a point of interest on the map, preview card, add
- **No key**: drop a pin and fill in the fields by hand

On save: status, tags, lists, note. If the place already exists, open the existing card.

### B. Everyday search

“Near me + open + pizza + restaurants” → cards → open detail or navigate out.

### C. Decide

Pool (list/tag/all restaurants) → filters (open tonight, radius, optional **avoid recent**) → wheel → result.

### D. Household vote (household only, in-app)

Nominate → vote → winner. No guest links.

### E. After a meal (flexible timing)

Mark been-there / optional visit; upload dishes now or later.

### F. Force refresh

Admin/user triggers re-fetch of place details from Google (respect quotas).

---

## Data sources (priority)

1. User content  
2. Google Takeout  
3. Google Places BYOK (instance key; optional member override)  
4. OSM optional  

CRUD works without a Google key.

---

## Clients

- **PWA first** (installable, mobile-friendly)
- Native apps later optional; not v1-critical
- **No offline mode** for now
- **One long-lived instance**

---

## UX principles

1. Card-first; near-me everyday default.  
2. Search is a first-class job.  
3. User beats source.  
4. Solo-clean, household-capable; private + shared.  
5. No public pages.  
6. Export always.  
7. Navigate elsewhere.  
8. Modules + MCP share the core API.  

---

## MVP sketch

> Binding scope: [mvp.md](mvp.md). Progress: [current-state.md](current-state.md).

**Shipped for v0.1 (code)** — accounts; library CRUD; cards/map; tags/lists; Takeout triage; search filters; enrichment + force refresh; dish photos + Google covers; Decide (Marketplace); MCP; Compose; trusted zip plugins.

**Still for v0.1 release (Phase 10)** — export JSON/GeoJSON; PWA basics; Coolify DoD; GHCR image.

**Soon after (v0.2+)**

- Household (shared/private, admin invites, in-app vote)  
- PWA share-target  
- One-click backup  
- Per-member Google key override  

**Later**

- Local LLM → filters  
- Public/sandboxed module store  
- Native apps if PWA isn’t enough  
- Offline mode, public share pages — not planned  
