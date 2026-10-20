# Los Angeles City zoning

## Source

The zoning layer uses Los Angeles City Department of City Planning's ArcGIS FeatureServer layer 15:
https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15

Its published fields include OBJECTID, Zoning, and CATEGORY. The service supports viewport-envelope queries, returnIdsOnly, and GeoJSON. New geography is requested at zoom 13+ in the selected study rectangle. The [source registry](sources/README.md) owns attribution, vintage, and provider access metadata.

## Incremental loading

The former recursive pagination logic could take dozens of sequential GIS calls without drawing any new polygons. The new loader:

1. Asks the provider for IDs intersecting the current viewport and study region using returnIdsOnly=true (unaffected by GeoJSON feature-set row limits).
2. Filters out IDs for which polygons are already retained.
3. Requests only missing polygons in batches of 40 with at most three concurrent requests.
4. Adds each completed batch to the map immediately, reporting loaded and remaining counts.
5. Keeps successfully fetched polygons if an unrelated batch is slow, canceled, or fails, and retries missing IDs upon a later visit.
6. Retains polygon geometry and window-ID indexes in memory and caches permitted source responses in browser IndexedDB/HTTP according to provider caching headers (maximum local six-hour TTL, potentially shorter).

No giant hosted database or entire-city download is introduced. Zooming out or toggling the overlay does not erase loaded polygons.

## Appearance and interactions

The ZONING_CATEGORIES array powers both MapLibre colors and the sidebar legend. The slider adjusts fill opacity from 0–100%, with 42% as its default and the preference remembered locally. Hovering or focusing a legend entry dims other categories and outlines every loaded matching polygon in yellow; leaving the item or removing focus restores all categories. Polygon clicks show the source zoning designation and category. Legend and opacity controls are shown only while zoning is on.

## Verification

Automated tests cover the two-stage API workflow, request bounds, progressive first paint, cancellation, retry, caching, legend hovering and keyboard focus, opacity, and map startup. A separate browser integration check exercises the real source for functional CORS/GeoJSON response handling. Provider service availability is external to this repository.
