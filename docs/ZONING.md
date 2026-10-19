# Live zoning overlay

## Scope and provenance

The first real external data overlay is the Los Angeles City Department of City Planning "Zoning" ArcGIS hosted FeatureServer, layer 15.

https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15

Source metadata identifies polygon geometry, zoning and category fields, GeoJSON support, a maximum record count of 2,000, and City of Los Angeles Department of City Planning attribution.

## Loading and limits

Disabled by default. Turn on "Los Angeles City zoning" and zoom to 13 or closer inside the provider coverage. On a completed camera movement, the application queries the intersection of (1) viewport, (2) study rectangle, (3) conservative source bounding box. Requests are snapped outward to 0.01 degrees, then intersected with study/source bounds again. This increases HTTP-cache reuse without triggering unrelated region downloads.

ArcGIS returns at most 500 records per page, up to four pages (2,000 features). The UI warns if truncated and asks the user to zoom closer. The client deduplicates feature IDs and then sends the resulting GeoJSON through the Rust/WASM bounding-box filter. Outdated in-flight queries are aborted when the view changes or the layer is disabled. A six-window in-memory LRU keeps recent query results, while normal browser HTTP caching respects provider headers.

MapLibre displays polygons by CATEGORY with 42% fill opacity; clicking one displays the authoritative zoning code and category. Values are never invented. Provider failures, rate limits, unsupported CORS or malformed results are surfaced as errors rather than hidden.

This adapter is a narrowly scoped first integration, not a universal zoning catalog. Geographic bounds represent rectangles, not exact city boundaries, and zoning assignments depend on the provider data. This layer is **not browser QA-certified** until verified on a real browser against the provider.

## Future improvements

- Per-window query diagnostics and precision guardrails.
- Provider-aware persistent IndexedDB caching, where permitted.
- Broader, source-metadata-driven layer catalog with legends and coverage info.
- City-vs-county zoning datasets explicitly separated.
