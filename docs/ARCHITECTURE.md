# Stratlas architecture

## Runtime

GitHub Pages publishes only static HTML, CSS, JavaScript and wasm-pack output. MapLibre manages WebGL rendering and viewport tile scheduling. The MapLibre custom stratlas:// protocol calls Rust tile_in_region for each tile **before any network request**. Out-of-region requests resolve to a transparent PNG locally; they do not reach a provider.

Tile intersection happens against a rectangle (west, south, east, north in WGS84 degrees). A tile intersecting the selected rectangle is shown whole, even where the raster extends slightly outside the region; the user explicitly does not need polygon clipping. MapLibre maxBounds separately restricts the camera.

Rust owns geographic predicates, coordinate transforms, bounding-box area calculations, tile grid generation and GeoJSON feature culling. JS owns MapLibre rendering, HTTP requests, browser preferences and minimal browser integration. The inspection grid is drawn using a transparent canvas above the map, using tile geometry produced by Rust/WASM; it is not a data-serving layer and makes no additional requests. Canvas rendering avoids z-order and `style.load` lifecycle dependencies that previously hid the grid.

## Provider adapters

Basemap registry lives in web/app.js. Future APIs use a second layer-catalog registry: metadata should include source, coverage, reference year, resolution, license, rate limits, CORS and API-key requirements. For geographic queries, request viewport intersection with region, not every location in a whole county. Bound feature counts and query density.

Census and zoning adapters query actual hosted public GIS/API services, use Rust/WASM for geospatial filtering and tract-statistic joins, and preserve already retrieved features during layer toggles, map-style changes and zoom-out. New requests require their source-specific detailed zoom, but existing geography is not discarded below it. Census request envelopes are recursively subdivided when provider output is capped, without an arbitrary total-call cutoff; up to three requests run concurrently, with depth and viewport constraints. Completed envelopes form a bounded geometric coverage index, so pans request only uncovered strips. Geometry is drawn before statistical enrichment finishes, with two bounded concurrent statistics batches. Memory-retained geography remains finite; there is no complete county mirror. `filter_geojson_bbox` filters intersecting feature extents rather than clipping polygon vertices.

## Caching

Basemap tiles use fetch with browser default HTTP caching, honoring provider Cache-Control/Expires/ETag. User selection does not download an entire study region and does not prefetch future zoom levels. Browser caches may be evicted.

Implemented: public geographic JSON requests use optional IndexedDB caching with versioned namespaces and per-source retention ceilings, bounded by upstream HTTP directives, and 192-record/24 MiB capacity. A clear-cache control is available. Basemap tiles remain in the browser's ordinary HTTP cache. No persistent data server is required. See [CACHE.md](CACHE.md).

## Future work

- Complete live-browser QA of the first LA City Planning ArcGIS zoning FeatureServer adapter (`web/zoning.js`; details in `docs/ZONING.md`).
- Add Census/INEGI statistical geography joins with stable geographic IDs and year metadata.
- Add election precinct/section aggregates and local zoning providers.
- Add independent layer toggles, legends, provenance, and efficient Rust spatial joins.
- Add only permitted browser caching after a provider-by-provider policy review.
