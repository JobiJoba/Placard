# Modules — Restaurants (first)

Enrichment makes places useful. **Modules** make the library *do something* with that data — without becoming a permanent knot inside Placard’s core.

Architectural rules (isolation, SDK, third-party future): [architecture-modules.md](architecture-modules.md).

Restaurants are the first module family: high personal usage, clear decisions (“where do we eat?”), and strong fit for photos, hours, lists, and tags.

Other types (hotels, cinemas, parks) can get modules later using the same pattern. Modules may also expose MCP tools ([mcp.md](mcp.md)).

---

## Design principle

```
Library (places + tags + lists + enrichment)
        ↓
   Module (tool that uses a filtered set of places)
        ↓
   Outcome (a pick, a vote, a memory on the card)
```

A module never replaces the library. It **consumes** a selection (list, tag, manual multi-select, or “all restaurants”) and optional filters (e.g. open tonight).

Household-only surfaces (voting) stay invisible in single-user mode. See [decisions.md](decisions.md).

---

## Module R1 — “What should we eat tonight?” (Decide)

**Solo-friendly. Shipped** as Marketplace plugin `@placard/module-restaurants-decide` (+ MCP `decide_restaurant`).

### Intent

Break decision paralysis: pick one restaurant from a curated pool.

### Inputs

- Source: a **list**, a **tag**, multi-select, or all places of type restaurant
- Filters (examples):
  - Open tonight / open now (from enrichment hours)
  - Cuisine / tags
  - Distance / near me (aligned with core library search)
  - **Exclude recently chosen** (product option — on by choice)

### Interaction

1. User builds or selects the pool
2. Applies filters (especially **open tonight** / near me)
3. Hits **Choose for me**
4. UI runs a playful **wheel / spinner / shuffle reveal**
5. Result = one restaurant → open card or “Open in maps”

### Notes

- Random is fine; weighted random can come later
- Avoid-recent should be a clear toggle/setting, not silent magic
- If the filtered pool is empty (“nothing open”), say so clearly and offer to relax filters
- Same decide capability should be an **MCP tool**

---

## Module R2 — Household vote (“What should *we* eat?”)

**Household-only. Hidden in single-user mode.**

### Intent

Several people propose or shortlist restaurants; the household votes; one wins.

### Sketch flow

1. Someone starts a **Dinner vote** (or “Tonight” session)
2. Scope: list / tag / open-tonight filter (same as Decide)
3. Members **nominate** restaurants from the library (or from the filtered pool)
4. Members **vote** (rules TBD: single choice, ranked, veto, …)
5. Result is shown; optional link out to navigate
6. Session can be archived (“we ate at X on date Y”) — can feed optional visit history later

### UX constraint

If the instance has no household, this module does not appear in navigation. Solo users only see Decide (R1) and dish memories (R3). Votes are **in-app only** (no guest couch links). Full member accounts only.

---

## Module R3 — Dish memories on the card

**Solo + household. Always useful.**

### Intent

When you open a restaurant card, you see **what you (or the household) already ordered there** — photos and short labels — not only generic venue photos.

### On the place card

- Section: **We’ve eaten here** / **Dishes**
- Each entry: photo(s), optional dish name, optional note (“too salty”, “order again”), optional date / visit
- Upload from phone after (or during) a visit

### Why it matters

Google Maps reviews are strangers. This is **your** taste memory. It makes the card uniquely valuable and reinforces “data at home”.

### Household angle

- Solo: “my dishes”
- Household: dishes can be attributed to a member (“Alex ordered the ramen”) without requiring public sharing

---

## Future restaurant module ideas (backlog, not committed)

- “Haven’t been in a while” suggestions
- Budget / weekday filters
- Cuisine roulette (spin cuisine first, then restaurant)
- Packing a shortlist for guests (“3 options for Saturday”)

---

## Module pattern for later place types

Same skeleton, different outcomes:

| Type | Example module |
| --- | --- |
| Hotel | “Pick a stay for these dates” from a shortlist |
| Cinema | “What’s on tonight among *our* cinemas” (needs showtimes connector) |
| Park | “Kid-friendly near me with playground” |

Restaurants stay first until Decide + Vote + Dish memories feel great.
