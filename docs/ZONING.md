# Live zoning overlay

## Scope and provenance

The first real external data overlay is the Los Angeles City Department of City Planning "Zoning" ArcGIS hosted FeatureServer, layer 15.

https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15

Source metadata identifies polygon geometry, zoning and category fields, GeoJSON support, a maximum record count of 2,000, and City of Los Angeles Department of City Planning attribution.

## Loading and limits

Disabled by default. Turn on "Los Angeles City zoning" and zoom to 13 or closer inside the provider coverage. On a completed camera movement, the application queries the intersection of (1) viewport, (2) study rectangle, (3) conservative source bounding box. Requests are snapped outward to 0.01 degrees, then intersected with study/source bounds again. This increases HTTP-cache reuse without triggering unrelated region downloads.

ArcGIS returns up to 500 records per page. When a visible bounding box reaches the previous 2,000-record limit, the client now recursively subdivides **only the visible rectangle**, deduplicating polygons by `OBJECTID`. The request budget is capped at 24 calls per navigation and subdivision stops at depth 2. If the budget is exhausted, the UI explicitly labels the area partial; additional close-up navigation can reveal more. Rust/WASM filters the resulting features. Previously loaded polygons remain visible while new requests run and while zooming out or hiding the layer. An in-session 24-window query cache and bounded 12,000-feature retained geometry store prevent needless toggle refetches. Optional IndexedDB caching stores permitted source responses for at most six hours (or less when upstream caching rules require). See [CACHE.md](CACHE.md).

MapLibre displays polygons by CATEGORY with 42% fill opacity; clicking one displays the authoritative zoning code and category. Values are never invented. Provider failures, rate limits, unsupported CORS or malformed results are surfaced as errors rather than hidden.

This adapter is a narrowly scoped first integration, not a universal zoning catalog. Geographic bounds represent rectangles, not exact city boundaries, and zoning assignments depend on the provider data. This layer is **not browser QA-certified** until verified on a real browser against the provider.

## Future improvements

- Per-window query diagnostics and precision guardrails.
- Provider-specific correctness and live-browser performance checks.
- Broader, source-metadata-driven layer catalog with legends and coverage info.
- City-vs-county zoning datasets explicitly separated.
