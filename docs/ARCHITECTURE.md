# Stratlas architecture

## Runtime

GitHub Pages publishes only static HTML, CSS, JavaScript and wasm-pack output. MapLibre manages WebGL rendering and viewport tile scheduling. The MapLibre custom stratlas:// protocol calls Rust tile_in_region for each tile **before any network request**. Out-of-region requests resolve to a transparent PNG locally; they do not reach a provider.

Tile intersection happens against a rectangle (west, south, east, north in WGS84 degrees). A tile intersecting the selected rectangle is shown whole, even where the raster extends slightly outside the region; the user explicitly does not need polygon clipping. MapLibre maxBounds separately restricts the camera.

Rust owns geographic predicates, coordinate transforms, bounding-box area calculations, tile grid generation, and GeoJSON feature culling. JS owns the MapLibre bridge, HTTP requests, browser preferences and UI controls. Do not rewrite the GPU renderer in Rust just for its own sake.

## Provider adapters

Basemap registry lives in web/app.js. Future APIs use a second layer-catalog registry: metadata should include source, coverage, reference year, resolution, license, rate limits, CORS and API-key requirements. For geographic queries, request viewport intersection with region, not every location in a whole county. Bound feature counts and query density.

A narrow Rust function filter_geojson_bbox is available for intersecting-feature filtering but no dataset adapter is shipped yet. It retains features whose bounding extents overlap the study rectangle; it does not perform exact polygon clipping.

## Caching

Basemap tiles use fetch with browser default HTTP caching, honoring provider Cache-Control/Expires/ETag. User selection does not download an entire study region and does not prefetch future zoom levels. Browser caches may be evicted.

For future permitted statistical data APIs, build versioned IndexedDB storage with per-source TTL, bounded capacity, schema migrations and a clear-cache control. Never treat an API response as permanently current and never ignore provider caching terms. No persistent data server is required. The zoning adapter also uses a bounded six-window in-memory LRU; it does not override upstream tile caching policies.

## Future work

- Complete live-browser QA of the first LA City Planning ArcGIS zoning FeatureServer adapter (`web/zoning.js`; details in `docs/ZONING.md`).
- Add Census/INEGI statistical geography joins with stable geographic IDs and year metadata.
- Add election precinct/section aggregates and local zoning providers.
- Add independent layer toggles, legends, provenance, and efficient Rust spatial joins.
- Add only permitted browser caching after a provider-by-provider policy review.
