# Your first library

Start with a running [Placard instance](install.md). Complete the first administrator
signup before exposing the instance to others.

## Add your first place

Open **Add**. Without a Google key, drop a pin, enter a name and type, and save.
With a configured key, search for a place or select a point of interest on the Google
map. Open the resulting card to add notes, tags, photos, or custom fields.

## Bring your Google saves

1. Export your saved places through Google Takeout. Keep the downloaded ZIP.
2. Open **Import**, choose the ZIP, and wait for parsing.
3. Review entries by source list, text, and keep/skip decision. Use bulk selection
   for groups you want to keep or leave out. You can return to unfinished triage.
4. Commit your selection. Parsing and triage do not call Google Places; matching
   and enrichment can use paid API calls when a key is configured.
5. Review uncertain matches in **Needs review**. Search for a better match,
   accept an available weak pin, or skip the entry.

The upload limit is 50 MB. See [Takeout formats](takeout-format.md) for supported
JSON and CSV layouts. Keep the original export until you have checked the result.
Undoing an import removes the places associated with that run; review the confirmation
before proceeding.

## Find something worth revisiting

**Near me** uses your location. If location access is unavailable, switch to **All**
or choose a **City**. Use the grid for cards or the map for geographic context.
Search by name and combine filters for type, tags, lists, visit status, or opening time.
Opening information depends on enrichment and may be outdated; confirm with the venue
when timing matters.

## Make the collection yours

Use tags for qualities such as “quiet” or “date night”; lists group places for trips
or projects. Mark places **Want to go** or **Been there**. Notes and photos capture
what you want to remember. Custom fields hold additional structured details.

Select owned places in the library to apply bulk actions. Deleted places can be
restored from **Recently deleted** during the 30-day window.

## Share with your household

An administrator creates invitations in **Settings → People** and enables household
mode. Owners can then share individual places. **Everyone**, **Mine**, and **Shared**
change which library entries you see. Lists remain private, and sharing a place
never creates a public link.

## Enrich a place

Configure the instance key in **Settings → Integrations**. Refresh a place to fetch
Google details. Normal refresh preserves manual overrides; force refresh is an
explicit choice. Read confirmation prompts before refreshing a whole collection.

## Export, extend, and connect

- **Settings → General:** export your library, including media. This is a personal
  export; use the [backup procedure](install.md#backup) for full instance recovery.
- **Settings → Marketplace:** install trusted modules or choose which appear in
  your navigation. Only an administrator installs executable plugins.
- **Settings → MCP:** create a token and follow the [client connection guide](mcp.md).
  Treat the token like a password and revoke it when no longer needed.

## Use Placard on your phone

Open your instance over HTTPS in your phone browser and use its home-screen install
or add-to-home-screen action. The app needs access to the server; it does not cache
your library for offline use. Choose your preferred maps app in settings to open
places for navigation.
