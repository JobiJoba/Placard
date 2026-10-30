# Feasibility — what is realistically possible

Aligned with [decisions.md](decisions.md): Google Takeout is required; Google BYOK enrichment is preferred; OSM is optional; modules (especially restaurants) are in-scope.

## Product layers

```
┌─────────────────────────────────────────────┐
│  Modules          decide wheel, household   │
│                   vote, dish memories       │  ← product vision
├─────────────────────────────────────────────┤
│  Your content     notes, tags, lists,       │
│                   dish photos, PDFs         │  ← always possible
├─────────────────────────────────────────────┤
│  Google BYOK      Places details, hours,    │
│                   phone, cuisine, …         │  ← preferred enrichment
├─────────────────────────────────────────────┤
│  Google Takeout   saved places & lists      │  ← must-have on-ramp
├─────────────────────────────────────────────┤
│  OSM (optional)   fallback / supplement     │  ← nice, not central
└─────────────────────────────────────────────┘
```

Library + user content + Takeout already make a product. BYOK makes cards richer. Modules make the library *useful for tonight*.

---

## What is clearly possible

### 1. Core place library (high confidence)

- CRUD, cards, detail, map
- Tags and lists
- Single-user default; household as an opt-in layer
- Private-only (no public share pages)

### 2. Google Takeout import (must-have, medium–high confidence)

Formats are awkward but well-trodden (Remap and others already parse Saved JSON/CSV). Expect messy edges; still the main way libraries get filled.

### 3. Google Places enrichment via BYOK (high confidence for personal use)

With a user-supplied API key:

- Place details: hours, phone, website, types, address, photos (ToS permitting), price level, etc.
- Enough structure for **open tonight** filters in pick / spin modules

Assumptions to document in setup docs later:

- Free monthly Google credits cover normal personal/household use
- **No automatic mass refresh cron** by default; explicit **Force refresh** (and per-place refresh) controls cost
- Instance-level API key; optional per-member override later
- Keyless mode still allows manual places + Takeout + user media
- Respect Google API ToS (display requirements, caching policies)
- Library search (radius + open + cuisine) is core and must stay snappy at ~500+ places

### 4. User-owned enrichment (high confidence)

- Notes, attachments, cover images
- **Dish memories** (photos of what you ordered) — no external API needed
- Manual hour overrides when APIs are wrong

### 5. Restaurant modules (high confidence for R1/R3; medium for R2)

| Module | Feasibility | Notes |
| --- | --- | --- |
| Pick / wheel + open-tonight | High | Needs hours + filter + fun UI |
| Dish memories on card | High | Upload + gallery on place detail |
| Household vote | Medium | Needs members, session model, permissions; hide entirely in solo mode |

See [modules-restaurants.md](modules-restaurants.md).

### 6. OpenStreetMap (optional, medium confidence)

Still useful as fallback when no Google key, or for amenities Google doesn’t care about. **Not** the primary enrichment story for this project.

---

## What is partially possible

### Restaurant menus (official)

User uploads and links first. Google may expose some attributes; full menu scraping remains a bad core dependency.

### Cinema showtimes / park events

Unchanged: manual + links first; connectors later. Not blocking restaurant-first modules.

### “Open tonight”

Feasible when hours exist (Google details or manual). UI must handle missing hours without breaking pick wheels (warn + allow unfiltered spin).

---

## What is a bad early bet

1. Public share pages (explicitly out of scope)
2. Aggressive scraping as a pillar
3. Forcing household UX on solo users
4. Building a navigator
5. Blocking MVP on perfect Google coverage for every imported pin

---

## Suggested enrichment architecture (concept)

```
Place
   │
   ├─ Provider: User content     → notes, dishes, attachments
   ├─ Provider: Google Places    → BYOK details / hours (preferred)
   ├─ Provider: Takeout import   → initial pins, lists, names
   └─ Provider: OSM (optional)   → fallback / amenity extras
```

Facts store `source`, `fetched_at`, and allow manual pin/override. User always wins.

Modules read from places + facts + user media; they do not own a parallel database of restaurants.

---

## Self-hosting feasibility

- Docker Compose: app + DB + media volume
- Settings: optional `GOOGLE_MAPS_API_KEY` (or UI-entered BYOK)
- Backups = DB + uploads (including dish photos)
- No mandatory project-operated cloud account; user’s Google key is theirs

Map tiles: configurable; attribution as required by the tile/provider choices.

---

## Feasibility verdict

| Question | Answer |
| --- | --- |
| Core library + Takeout? | **Yes — central** |
| Rich enrichment without running our own Google bill? | **Yes — BYOK** |
| Pick wheel + open tonight? | **Yes**, once hours exist |
| Dish photo history on cards? | **Yes** |
| Household vote without harming solo UX? | **Yes**, if gated hard |
| OSM as primary? | **No** (optional only) |

**Bottom line:** own the archive, enrich with the user’s Google key, then ship restaurant **modules** that make “tonight” easy — privately, on their server — with Compose/Coolify install and MCP as first-class self-host surfaces (see [deployment.md](deployment.md), [mcp.md](mcp.md), [architecture-modules.md](architecture-modules.md)).
