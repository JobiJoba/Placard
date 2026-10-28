# Takeout fixtures (anonymized sample)

Derived from a real Google Takeout export, reduced and scrubbed for tests.

## Layout (mirrors Google Takeout)

```
takeout/
  Maps (your places)/Saved Places.json   # GeoJSON FeatureCollection (starred / "your places")
  Saved/*.csv                            # custom lists
```

## Format notes observed in the wild

### `Saved Places.json`
- GeoJSON `FeatureCollection`
- Each feature: `geometry` Point `[lng, lat]`, `properties.date` (ISO UTC), `properties.google_maps_url`
- Happy path: `properties.location` with `name`, `address`, `country_code`
- Edge case: no `location`; `geometry.coordinates` is `[0, 0]`; `properties.Comment` is `"No location information is available for this saved place"`; URL uses `?q=...&ftid=0x...:0x...` instead of `?cid=`
- Happy-path URL shape: `http://maps.google.com/?cid=<decimal>`

### `Saved/*.csv`
- Header: `Title,Note,URL,Tags,Comment`
- Often an empty row right after the header
- URL shapes:
  - `https://www.google.com/maps/place/Name/data=!4m2!3m1!1s0x...:0x...`
  - Dropped pin: `https://www.google.com/maps/search/lat,lng`
- Empty lists exist (header + empty row only), including duplicate-looking names like `Default list(1).csv`
- Notes/Tags/Comment are usually empty; Notes appear on some travel lists
- Unicode titles appear (CJK, accents)

## Anonymization applied
- Personal list names renamed (`Elysa` → `Shared picks`, `Mamy brocante` → `Market finds`, trip list → `City trip`)
- Sampled subset only (not the full library)
- Likely-personal place names (nursery, home, charging, …) excluded from the JSON sample
- Personal-looking notes scrubbed
- Timestamps normalized to `T12:00:00Z`

Do **not** commit raw Takeout exports. Keep them outside the repo or under a gitignored `Takeout/` folder.
