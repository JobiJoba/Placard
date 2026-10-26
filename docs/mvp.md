# MVP freeze — Placard v0.1

The scope contract for the first build. Anything not listed under **In** is out of v0.1, even if it appears elsewhere in the docs. To change scope, edit this file first.

Source docs: [decisions.md](decisions.md), [first-user.md](first-user.md), [product-overview.md](product-overview.md).

## Goal of v0.1

The founder can replace Google Maps Saved for everyday use:

1. Get ~500 existing places into Placard (Takeout) and keep adding new ones (manual add).
2. Find something fast: "restaurants open now within 5 km that do pizza".
3. Let Placard pick dinner with the wheel.
4. Do the same from an AI client via MCP.

## In

### 1. Adding places

There are two ways in, and both are first-class.

**A. Google Takeout import**

The import runs in three steps, so nothing costs API calls until you've decided what to keep.

1. **Parse (free).** Upload the Takeout export (Saved Places JSON and saved-list CSVs). Placard reads it locally: name, address, coordinates, Google Maps URL, list membership, date saved, your Google note if any. No API calls.
2. **Triage (free).** A review screen to decide what comes in, using only Takeout data:
   - Table and map views of every entry
   - Filter by source list, date saved, area or city (map selection or radius), and text
   - Keep or skip per entry, plus bulk keep/skip for the current filter (e.g. "skip everything from my 2019 Lisbon list")
   - Placard flags entries that already exist in the library and entries duplicated across lists
   - Running count of kept entries and the API calls they'll need
   - Triage can be saved and resumed; nothing enters the library yet
3. **Import and match (uses API calls).** Only kept entries are created. With a key, they're matched to a Google Place ID and enriched. Entries that can't be matched confidently land in a "Needs review" queue to confirm or skip.

Other rules:

- Google list names become Placard lists, for kept entries only.
- Re-importing the same export must not create duplicates. Entries skipped last time are remembered and stay skipped unless you change them.

**Removing places after import**

Importing doesn't lock anything in. In the library:

- Delete a single place from its card
- Multi-select in the card grid or search results, then bulk delete, bulk tag, or bulk add/remove from a list
- "Undo import": remove everything created by a given import run (places you've since edited, tagged, or added photos to are listed for confirmation first)
- Deletes ask for confirmation; deleted places can be restored for 30 days (soft delete), then purged with their media

**B. Manual add (an "Add place" page)**

- **Search / autocomplete** through Google Places: type a name, pick a suggestion, preview it, save it.
- **Map picker**: browse a map, click a point of interest, see a preview card, then add it.
- **Fallback without a key**: drop a pin and type the name and type by hand.
- When saving, you can set status (want to go / been there), tags, lists, and a note.
- Duplicate guard: if the Place ID already exists, open the existing card instead of creating a second one.

### 2. Library

- Card grid as home, defaulting to places near your current location (with a city or "all" switch).
- Place detail: facts with their source, notes, photos, status, tags and lists, and "Open in Google Maps / Apple Maps / Organic Maps".
- Simple map view of the filtered set.
- Tags and lists: create, rename, delete, assign.
- Status: **want to go** / **been there**.
- Photo upload on a place, including dish photos as a simple gallery with an optional caption.

### 3. Search and filters (core)

All filters combine:

- Text (name, notes, cuisine)
- Type / category
- Open now / open tonight (from stored hours)
- Within N km of you (or of a chosen point)
- Tag, list, status

Distances show in km or miles according to a user setting. Results need to feel instant at ~500–1,000 places. Filters are a structured query, so the MCP layer (and later an LLM) can drive them.

### 4. Enrichment

- One Google API key for the whole instance, entered in admin settings or through an environment variable.
- Fetch details when a place is created or matched: hours, phone, website, address, types, price level, rating.
- A **Refresh** button on a place, and a **Force refresh all** button in settings that shows the expected API call count first.
- No background refresh job.
- Manual edits override fetched values, and refreshes keep the override.

### 5. Decide module (`restaurants.decide`)

- Pool: a list, a tag, the current search results, or all restaurants.
- Filters: open tonight and distance.
- Wheel or spinner reveal, then the result card.
- Optional "avoid recent picks" toggle.
- Built as an in-repo module behind the module boundary from [architecture-modules.md](architecture-modules.md).

### 6. MCP (must-ship)

- Streamable HTTP endpoint at `/mcp` on the same app.
- Personal access tokens created in settings.
- Tools: `search_places`, `get_place`, `create_place` (from a Place ID or coordinates), `add_to_list`, `set_status`, `decide_restaurant`.
- Same permission rules as the web UI.
- A "Connect MCP" settings page with config snippets for Cursor and Claude.

### 7. Accounts

- Multi-user accounts, each with a private library.
- The first user to sign up becomes admin. Admin creates or invites other users.
- No household sharing yet, but the data model already carries an owner and a visibility field, so household can be added without migrating every table.

### 8. Self-hosting

- Docker Compose: app, Postgres, and a media volume.
- `.env.example`, healthcheck, and an install guide with a Coolify section.
- Export everything as JSON and GeoJSON.
- AGPL-3.0.
- Installable PWA basics: manifest, icons, a mobile-friendly layout. No offline mode.

## Out (explicitly not in v0.1)

| Feature | Planned for |
| --- | --- |
| Household: shared and private places, invites, member attribution | v0.2 |
| Dinner vote module | v0.2 (needs household) |
| Per-member Google key override | v0.2 |
| One-click backup and restore UI | v0.2 (export plus documented `pg_dump` in v0.1) |
| Optional visit history (dates, count) | v0.2 (status only in v0.1) |
| PWA share target ("share to Placard" from Google Maps) | v0.2 |
| Local LLM for natural-language search | Later |
| OSM enrichment / fallback search | Later |
| Third-party modules, module SDK, manifest | Later |
| Native mobile apps | Later |
| OIDC / SSO | Later |
| Hotel, cinema, and park modules | Later |
| Menus as structured data, showtimes, events | Later |
| Offline mode, public share pages | Not planned |

## Definition of done

v0.1 ships when, on a fresh `docker compose up`:

1. Admin signs up, sets the Google key, triages a real Takeout export of ~500 places (skipping some without any API call), and imports the rest with lists preserved. Then bulk-deletes a few imported places.
2. Admin adds a new place through autocomplete, and another by clicking it on the map.
3. "Pizza, open now, within 5 km" returns the right cards quickly.
4. The Decide wheel picks from an open-tonight list.
5. From Cursor or Claude via MCP: search, add to a list, and decide all work with a token.
6. Export produces a complete JSON/GeoJSON file.
7. The same stack deploys on Coolify by following the install guide.

## Known risks for v0.1

- **Takeout matching**: exports often carry map URLs or coordinates rather than Place IDs. Some places will need manual confirmation in the review step.
- **API cost at import**: matching plus fetching details for ~500 places is a burst of calls. The free triage step cuts this down; still show the count, batch the work, and make it resumable.
- **Map picker depends on map choice**: clicking a point of interest to get a Google Place ID works naturally on Google's own map. On other map tiles, a click becomes a nearby search instead. This is a stack decision.
- **Google display rules**: Places content shown on screen comes with attribution and caching rules. Check them during implementation.
