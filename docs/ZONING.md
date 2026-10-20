# Los Angeles City zoning

## Source

The zoning layer uses Los Angeles City Department of City Planning's ArcGIS FeatureServer layer 15:
https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15

Its published fields include OBJECTID, Zoning, and CATEGORY. The service supports viewport-envelope queries, returnIdsOnly, and GeoJSON. At broad zoom, Stratlas requests source-side **grouped counts by CATEGORY** for at most nine visible, reproducible geographic cells. Their color describes the most frequent category by **number of intersecting source polygons, not land area**. At zoom 13+, individual zoning polygons are retrieved for the selected visible study rectangle. The overview is a summary, not a full download of zoning geometry. The [source registry](sources/README.md) owns attribution, vintage, and provider access metadata.

## Incremental loading

The former recursive pagination logic could take dozens of sequential GIS calls without drawing any new polygons. The new loader:

1. Asks the provider for IDs intersecting the current viewport and study region using returnIdsOnly=true (unaffected by GeoJSON feature-set row limits).
2. Filters out IDs for which polygons are already retained.
3. Requests only missing polygons in batches of 40 with at most three concurrent requests.
4. Keeps a shared, three-request geometry worker pool across camera movement. In-flight batches finish and enter the retained cache; queued old-area batches are replaced with jobs from the newest viewport. The new area is never forced to wait for all polygon requests from the previous area.
5. Publishes polygons as responses arrive, throttling MapLibre's GeoJSON source updates to roughly eight per second. Only polygons overlapping the visible viewport are sent to the renderer, while the previously visited geometries stay in browser memory.
6. Reuses the cached ID window when panning back; failed ID lookups and missing geometry groups can retry after navigation. No viewport key is permanently poisoned by a failed call.
7. Keeps a bounded polygon/ID index in memory and stores provider-permitted API responses in IndexedDB/HTTP (up to six hours, potentially shorter under provider cache directives).

No giant hosted database or entire-city download is introduced. Zooming out or toggling the overlay does not erase loaded polygons.

## Appearance and interactions

The ZONING_CATEGORIES array powers both MapLibre colors and the sidebar legend. The slider adjusts fill opacity from 0–100%, with 42% as its default and the preference remembered locally. Hovering or keyboard-focusing a legend entry outlines matching loaded polygons in yellow without rewriting the base fill's opacity. Rapid pointer transitions are coalesced into a single animation frame to avoid flashing or repeated whole-layer repainting; leaving/focus-out removes the highlight. Polygon clicks show the source zoning designation and category. Legend and opacity controls are shown only while zoning is on.

## Verification

Automated tests cover the two-stage API workflow, request bounds, progressive first paint, cancellation, retry, caching, legend hovering and keyboard focus, opacity, and map startup. A separate browser integration check exercises the real source for functional CORS/GeoJSON response handling. Provider service availability is external to this repository.
