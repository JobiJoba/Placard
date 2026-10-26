# Competitors & adjacent landscape

Placard sits at the intersection of **saved places**, **self-hosting**, and **personal knowledge**. Nothing dominant owns that exact intersection today — but plenty of adjacent tools matter.

## The thing people actually use today

| Product | Role | Gap vs Placard idea |
| --- | --- | --- |
| **Google Maps** (Saved / Stars / Lists) | Default habit for saving places | Cloud lock-in; weak personal enrichment; export friction |
| **Apple Maps Guides** | Curated lists on Apple devices | Ecosystem lock-in; limited self-host story |
| **Organic Maps / OsmAnd / CoMaps** | Offline maps + bookmarks | Excellent navigation/offline; bookmarks are thin (not rich cards, menus, showtimes) |
| **Wanderlog / similar trip apps** | Trip planning & shared itineraries | Trip-centric and usually cloud; not a forever personal place library |

**Takeaway:** the competitor for *habit* is Google Maps Saved. The competitor for *self-host niche* is a scattered set of smaller projects.

## Self-hosted / open-source adjacent

### Closest cousins

| Project | What it is | Overlap | Difference |
| --- | --- | --- | --- |
| **[TRIP](https://github.com/itskovacs/trip)** | Self-hosted POI map + trip planner | Places on a map, privacy, Docker | Trip/adventure planning first; less “rich typed place cards + living enrichment” |
| **[TREK Collections](https://github.com/liketrek/TREK/wiki/Collections)** | Server-wide saved place lists (want/visited, labels, share, GPX) | Lists of places independent of a single trip | Still trip-ecosystem oriented; enrichment depth unclear vs restaurant menus / cinema / park amenities |
| **[Nextcloud Maps](https://github.com/nextcloud/maps/)** | Favorites + custom maps inside Nextcloud | Private favorites, OSM-based | Tied to Nextcloud; favorites are not a dedicated rich place library |
| **[Remap](https://github.com/aaleksandar/remap)** | Import Google Takeout → shareable map/lists | Import + lists + privacy toggles | Sharing/export oriented more than ongoing enrichment at home |
| **[Favorite Places](https://github.com/508-dev/favorite-places)** | Static travel-guide site from Google lists | Cards, tags, maps from saved lists | Static site / guide publishing, not a living self-hosted app |

### Outdoor / spatial archives (related, different job)

| Project | Focus |
| --- | --- |
| **[GeoVault](https://github.com/cyberes3/geovault)** | Personal spatial data vault (GPX/KML, collections, Android helpers) |
| **[Trailkeepr](https://github.com/TheoFABIEN/Trailkeepr)** | Archive outdoor adventures (tracks, POIs, photos) |
| **MyPlaces** (various older POI collection projects) | Collections of POIs on OSM maps |

These prove demand for *owning geographic memory*, but they optimize for **tracks and outdoors**, not everyday urban place cards (restaurants, cinemas, playgrounds).

## How Placard should differentiate

A useful differentiation statement:

> **Placard is not a trip planner and not a navigator.**  
> It is a **private place library**: card-first browsing, tags & lists, Google-quality enrichment (BYOK), and **modules that act on the library** (restaurant decide/vote/dish memories first) — with a path to third-party modules and MCP access. No public share pages.

### Differentiation matrix (target)

| Capability | Google Saved | TRIP / TREK-like | Nextcloud Maps | **Placard (target)** |
| --- | --- | --- | --- | --- |
| Self-hosted | No | Yes | Via Nextcloud | Yes (standalone) |
| Place cards with rich detail | Limited | Basic–medium | Basic | **Core** |
| Tags + custom lists | Lists yes, tags weak | Lists/labels | Categories | **Core** |
| Typed enrichment (restaurant / cinema / park) | Platform-owned | Limited | Limited | **Core ambition** |
| User-owned media (menus, photos, PDFs) | Weak | Varies | Files elsewhere | **First-class** |
| Google Takeout import | N/A (source) | Sometimes | Partial | **Important on-ramp** |
| Trip itinerary planning | Partial | Strong | Weak | Non-goal (v1) |
| Turn-by-turn nav | Strong | Weak | Weak | Non-goal |

## Competitive strategy (documentation-era)

1. **Win the story** — “Immich for starred places” is memorable; keep saying it.
2. **Win the on-ramp** — Google Takeout / saved-list import is table stakes.
3. **Win the card** — place detail pages must feel richer than a pin + note.
4. **Stay humble on live data** — open data + user uploads first; connectors as optional plugins.
5. **Play nice with navigators** — deep-link / export to Organic Maps, OsmAnd, Google Maps for “get me there”.

## Watch list (revisit periodically)

- TRIP feature growth (if they add rich typed enrichment, overlap increases)
- TREK Collections maturity
- Nextcloud Maps favorites UX
- Any new “self-hosted Google Saved Places” projects
- OSM / Wikidata tooling improvements that make enrichment cheaper

## Honest conclusion

The idea is **not** empty blue ocean — adjacent tools exist.  
It **is** still a good idea if Placard commits to a sharp job:

**rich, owned, organized place cards for everyday favorites**, in the self-hosted aesthetic,

instead of becoming a generic map with pins.
