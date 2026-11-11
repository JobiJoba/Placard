# Meet Placard

Placard is a self-hosted library for the places you care about. Bring saved places
from Google Takeout, add new discoveries, and keep your notes and photos beside
each place. Browse a collection that belongs to you.

## From saved places to a useful library

| Your task | In Placard |
| --- | --- |
| Bring an existing collection | Upload Takeout, choose what to keep, then review uncertain matches |
| Save somewhere new | Drop a pin, or use Google search and map picking with an API key |
| Find the right place | Browse Near me, City, or All; filter by type, tags, lists, status, and opening time |
| Remember why it matters | Add notes, photos, custom fields, and want-to-go / been-there status |
| Share at home | Invite members and selectively share places when household mode is enabled |
| Make a decision | Install an optional Marketplace module such as a pick wheel |
| Work with an agent | Connect an MCP client using a personal access token |
| Take your data with you | Export your library as JSON, GeoJSON, and media |

## Private libraries, optional household sharing

The first account is the administrator. Additional members join through invitations.
Each member has a private library. An administrator can enable household mode;
place owners then choose which places to share. Sharing does not make a place public.

Owners control core edits, sharing, and deletion. Household members can view shared
places and contribute dish photos. Lists remain private. Guest voting and shared
lists are not included.

## Google is optional

Manual pins, library organization, Takeout triage, and MCP work without a Google key.
An instance key enables Google autocomplete, map picking, matching, and enrichment.
Google services may charge for usage. Review [Google setup](google-apis.md) before
committing a large import. Your server stores the library; enabled integrations
still communicate with their providers.

## Built for your server

Docker Compose runs the app, a background worker, and Postgres with PostGIS.
Database, media, and module files persist in volumes. Use HTTPS for remote access.
Placard is free software under AGPL-3.0.

The browser app includes a home-screen manifest and icons. It needs a network
connection; offline use and native mobile apps are not included. Modules are
trusted code installed by an administrator, not sandboxed extensions.

## Start with one place

[Install Placard](install.md), create your administrator account, then follow the
[user guide](user-guide.md). Placard v1.0.0 is available; see the
[release overview](release-1.0.md) for included features and current limits.
