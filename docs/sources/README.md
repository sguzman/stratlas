# Geographic data source registry

This directory is Stratlas's source of truth for provider provenance. The [machine-readable catalog](catalog.json) contains each source's identity, original URL, coverage, attribution, terms/policy reference, vintage, access method, cache restrictions, and integration status. For the formal definitions of place types, datasets, geographic identities, observations and which application layers consume each source, see the separate [place and source ontology](../ontology/README.md) and [binding manifest](../ontology/sources.json).

## Meaning of statuses

- **implemented**: a basemap is wired into the application.
- **implemented-key-required**: source is selectable, but the user must supply a provider key.
- **implemented-browser-qa-pending**: adapter is deployed and has automated tests, but actual source request, CORS behavior, and layer rendering have not yet been confirmed in a live browser.
- **implemented-browser-verified**: a real browser has successfully reached the external provider and the corresponding UI integration checks have passed. This is not a guarantee of uptime, exhaustive geographic coverage, or performance on every connection.
- **research-only**: investigated source, not a working overlay. Never present it as implemented.

## Interpretation safeguards

Income is not wealth. County assessor tax-roll land values are not market sale prices. Census tracts are aggregate geographies, not personal records. Electoral results do not disclose individual voting preferences. Administrative presets are study rectangles, not precise municipal boundaries. OpenStreetMap community tiles may not be bulk-prefetched. USGS topographic, shaded relief, and aerial imagery basemaps primarily cover the United States. They overzoom their detailed native tile cache beyond level 16. A missing USGS 404 tile indicates unserved geographic coverage and is shown as blank (relief ocean areas are sometimes unfilled). Imagery dates vary by geography and are not live satellite views. Source-specific licensing and caching requirements always take precedence over Stratlas defaults.

## New sources

Before an adapter is shipped, add an entry to catalog.json with its coverage, vintage, provider, terms, authentication, cache constraints, and status. Verify spatial request restrictions, output schema, and browser behavior. Detailed implementation documents live at [Zoning](../ZONING.md), [Census](../CENSUS.md), [Parcels](../PARCELS.md), and [Cache](../CACHE.md).
