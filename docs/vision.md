# Vision

## The problem

Most people already maintain a personal geography of favorites:

- Restaurants worth returning to
- Parks with a good playground
- Cinemas, museums, trails, cafés, viewpoints
- “Want to go” lists for the next weekend or trip

Today that living memory usually lives inside **Google Maps** (stars, lists, “Saved”), sometimes Apple Maps Guides, sometimes scattered notes and screenshots.

That creates three frictions:

1. **Lock-in** — leaving the platform means losing structure, notes, and context.
2. **Shallow ownership** — you rarely get a durable place for *your* extras: the PDF menu, dish photos from last visit, “kids like the upstairs terrace”.
3. **Living data is fragmented** — hours, menus, and decisions sit on dozens of apps; none of them help *your household* pick dinner from *your* list.

Self-hosters already solved analogous problems for photos (Immich), documents (Paperless), and media (Jellyfin). **Places have not had a clear Immich-like home yet.**

## The opportunity

Build a focused self-hosted app whose job is:

> Collect places → organize them → enrich them → **act on them**.

Not navigate the world. Not become a public social network. Not scrape the entire internet.

A good north star:

- **Immich** for “my media, my machine”
- **Placard** for “my places, my machine — and modules that use them”

## Product thesis

**Placard is a private place library with rich cards — plus modules that turn that library into decisions.**

- Each place is a first-class object (name, location, type, notes, media, tags).
- Cards are the default browsing unit; the map is a complementary view.
- Lists and tags are how you think (“Italian restaurants”, “Rainy-day indoor”, “With kids”).
- Enrichment prefers **Google Places via bring-your-own-key (BYOK)** for quality; OpenStreetMap is optional/fallback.
- **Google Takeout import is essential** so the library fills up from day one.
- The **core** stays focused; specialized behavior lives in **modules** that talk to core through a stable contract — so we (and later others) can add tools without forking the heart of the app. See [architecture-modules.md](architecture-modules.md).
- First modules: **restaurants** (decide / wheel, household vote, dish photo history).
- Agents use the same capabilities via an authenticated **MCP** server (**must-ship**). See [mcp.md](mcp.md).
- **Multi-user accounts from day one**; household chrome stays out of the way until enabled. Places can be **private or household-shared**. No public share pages.
- Install story is **Docker Compose / Coolify**-class self-hosting; Nextcloud is a neighbor, not a required host. License intent **AGPL-3.0**. See [deployment.md](deployment.md).

If someone imports hundreds of saves, finds “pizza open within 5 km”, spins for tonight, and later sees dish photos on the card — the product is working.

## What we want the product to do (beyond a pin board)

### Library (foundation)

Save places, enrich them, tag them, put them in lists, browse cards, open details, attach media — and **search your own library better than Google Maps Saved** (open + radius + cuisine/type + tags). Everyday UX defaults to **near me**; travel cities stay available.

### Modules (why enrichment matters)

Enrichment is not only for prettier cards. It unlocks tools. First focus: **restaurants**.

Examples (see [modules-restaurants.md](modules-restaurants.md)):

- **Decide for me** — pick a list/tag/selection, filter to open tonight, run a wheel, get one restaurant.
- **Household vote** — propose restaurants, vote as a household (only when household mode is on).
- **Dish memories** — upload photos of what you ordered; see them on the restaurant card next visit.

Hotels and other types can get similar modules later. Restaurants ship the pattern first.

## Who it is for

### Primary

Self-hosters who already run Docker / a NAS / a VPS, star many places on Google Maps, and want that data at home — with notes, photos, and decision tools.

### Also

Households on one instance (family dinner votes, shared lists) — without forcing household UX on solo users.

### Explicit non-goals

- Competing with Google Maps / Organic Maps on routing and global discovery
- Public city-guide pages or Remap-style public profiles
- Requiring a Google API key for basic CRUD (keyless + Takeout + manual still works; BYOK unlocks richer enrichment)
- Perfect automated menus/showtimes for every venue worldwide on day one
- Showing household chrome (votes, member attribution UI) when the install is single-user only

## Why this can be a good idea

| Signal | Why it matters |
| --- | --- |
| Clear analogy | Immich-style framing is easy to explain in the self-host community. |
| Real pain | Takeout exists, but there is no beloved home for the enriched collection *plus* “what do we eat?” tools. |
| Differentiation | Adjacent tools lean trip planning or thin favorites — not rich cards + restaurant decision modules. |
| Google BYOK | Places quality without forcing the project to pay API bills; free credits cover normal personal use. |
| Incremental value | Useful as a library alone; modules make it sticky. |

## Risks to stay honest about

1. **Module scope creep** — restaurant tools are exciting; keep the library solid first.
2. **Google dependency** — BYOK is fine; document quotas, ToS, and keyless degradation clearly.
3. **Crowded adjacent space** — TRIP, Nextcloud Maps, TREK, etc. Winning needs cards + modules + privacy, not “yet another POI map”.
4. **Mobile habit** — without easy phone add/upload (dishes, quick-save), the library stays empty.
5. **Household complexity** — gate it hard so solo installs stay simple.

## Success criteria (early)

1. Import Google Takeout (~500 places) into a usable library
2. Search: open + radius + cuisine/type from *my* data
3. Enrich with BYOK Google; hours good enough for open-tonight; **Force refresh** available
4. Run **Decide** (wheel) on a filtered pool (optional avoid-recent)
5. MCP: search + get place + decide from an agent client
6. Dish photos and want/been-there status work on cards
7. (Household later) private + shared places; admin invites; in-app vote only

## One-line pitch variants

- For self-hosters: *“Immich for your starred places.”*
- For product: *“Your places at home — search them properly, then tools that help you choose.”*
- For restaurants: *“Your restaurant list, with a wheel for tonight and photos of what you already loved.”*

## Related docs

- [decisions.md](decisions.md) — resolved product choices
- [first-user.md](first-user.md) — founder priorities
- [modules-restaurants.md](modules-restaurants.md) — restaurant tools
- [architecture-modules.md](architecture-modules.md) — core vs modules
- [mcp.md](mcp.md) — agent access (must-ship)
- [deployment.md](deployment.md) — Coolify / Docker / Nextcloud
- [naming.md](naming.md) — Placard
