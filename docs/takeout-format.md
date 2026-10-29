# Google Takeout format

What Placard’s importer expects from a Google Takeout of Maps saved places. Anonymized examples live in the repo under `test/fixtures/takeout/`.

## Export paths

| Path | Role |
| --- | --- |
| `Maps (your places)/Saved Places.json` | Starred / “Your places” pins (GeoJSON) |
| `Saved/<List name>.csv` | Custom saved lists |

A Takeout may include either or both. Upload a zip or an extracted folder with this layout.

## `Saved Places.json`

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [<lng>, <lat>] },
      "properties": {
        "date": "2024-06-01T12:00:00Z",
        "google_maps_url": "http://maps.google.com/?cid=<decimal>",
        "location": {
          "name": "Place name",
          "address": "Street, City, Country",
          "country_code": "BE"
        }
      }
    }
  ]
}
```

### Edge case: unresolved place

Some features have **no** `location`, coordinates `[0, 0]`, and:

- `Comment`: `"No location information is available for this saved place"`
- URL like `http://maps.google.com/?q=Some+Address&ftid=0x...:0x...`

These must appear in triage as “needs location / weak match”, not as a pin at Null Island.

### Useful fields for triage (no API)

- Name, address, country, date saved, maps URL
- CID or `0x…:0x…` / `ftid` when present (for later matching)

## `Saved/*.csv`

```csv
Title,Note,URL,Tags,Comment
,,,,
Some Place,,https://www.google.com/maps/place/Some+Place/data=!4m2!3m1!1s0xabc:0xdef,,
```

### Quirks to handle

1. Empty row immediately after the header (common).
2. Empty lists (header + empty row only), including names like `Default list(1).csv`.
3. URL variants:
   - Place link with `data=!4m2!3m1!1s0x…:0x…`
   - Dropped pin: `/maps/search/<lat>,<lng>`
4. Unicode titles and occasional Notes.
5. Tags / Comment usually empty in this export; still parse columns if present.

List file name (without `.csv`) becomes the Placard list name for kept entries.

## Matching strategy (after triage)

| Signal | Confidence |
| --- | --- |
| `cid=` from JSON URL | High → Place Details / cid lookup |
| `1s0x…:0x…` or `ftid=0x…:0x…` | High → hex feature id |
| Name + lat/lng | Medium → nearby / text search |
| Name + address only | Lower → text search |
| Unresolved (`[0,0]` / no location) | Manual review queue |

Never call the Places API during the free triage step.

## Fixture vs personal export

- **Committed:** `test/fixtures/takeout/` (small, scrubbed).
- **Not committed:** raw `Takeout/` at repo root (gitignored). Drop a fresh export there locally when debugging the importer.
