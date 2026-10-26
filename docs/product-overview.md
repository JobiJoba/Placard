# Product overview (concept)

No UI code yet — this is the conceptual shape of **Placard**.

Resolved choices: [decisions.md](decisions.md).  
First-user priorities: [first-user.md](first-user.md).  
Restaurant tools: [modules-restaurants.md](modules-restaurants.md).  
Core vs modules: [architecture-modules.md](architecture-modules.md).  
MCP: [mcp.md](mcp.md).  
Deploy: [deployment.md](deployment.md).

## Modes: single user vs household

| Mode | Who | What you see |
| --- | --- | --- |
| **Solo chrome** (default) | One active person; multi-user accounts still exist in the system | Library, tags, lists, enrichment, **search**, restaurant **Decide**, dish photos. No voting chrome. |
| **Household** (opt-in) | Multiple full members; **admin invites only** | Shared *and* **private** places; dinner **votes** (in-app only); optional dish attribution. No guest/kid seats. |

Household unlocks features; it does not force every place to be shared. Members can keep private places while contributing to shared lists.

Privacy: never public on the internet. Visibility = private to a user, or shared within the household.

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

## Views

### 1. Library (cards) — default home

Everyday bias: **near me** / current city. Travel cities stay in the library but aren’t the default flood.

Cards: cover, name, type, status, tags, “Open now”, cuisine.

### 2. Place detail

Header → map + open-in-nav → notes/media → dish memories → facts → status/visits → tags/lists.

### 3. Map

Filtered library on a map (radius search belongs here + in search).

### 4. Search / filter — **core product**

Beat Google Maps Saved search. Examples:

- Type = restaurant  
- Cuisine / text = pizza  
- Open now / open tonight  
- Within **N km of me**  
- Tag / list / want vs been  

Structured filters first. Later: optional **local LLM** that compiles natural language into the same filter AST ([first-user.md](first-user.md)).

### 5. Lists & tags

### 6. Modules

Restaurant Decide / Vote / Dishes; household-only modules hidden in solo chrome. Exposed via UI **and MCP**.

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

> Superseded by [mvp.md](mvp.md), which is the binding scope. This sketch is kept for context.

**Must have**

- Multi-user accounts; places CRUD; cards; detail; simple map  
- Tags + lists; want / been-there  
- Google Takeout import (hundreds of places)  
- Near-me + open + type/cuisine/tag/list **search filters**  
- Notes + images (dish photos supported)  
- Instance Google BYOK enrichment + **Force refresh**  
- Restaurant **Decide** (wheel) + open filter; optional avoid-recent  
- Authenticated **MCP** (core tools + decide)  
- Docker Compose deploy  
- AGPL-3.0

**Soon after**

- Household (shared/private, admin invites, in-app vote)  
- PWA polish / share-target  
- One-click backup  
- Per-member Google key override  

**Later**

- Local LLM → filters  
- More modules; third-party module install  
- Native apps if PWA isn’t enough  
