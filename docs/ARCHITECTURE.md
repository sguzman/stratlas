# Stratlas architecture

## Runtime

GitHub Pages publishes only static HTML, CSS, JavaScript and wasm-pack output. MapLibre manages WebGL rendering and viewport tile scheduling. The MapLibre custom stratlas:// protocol calls Rust tile_in_region for each tile **before any network request**. Out-of-region requests resolve to a transparent PNG locally; they do not reach a provider.

Tile intersection happens against a rectangle (west, south, east, north in WGS84 degrees). A tile intersecting the selected rectangle is shown whole, even where the raster extends slightly outside the region; the user explicitly does not need polygon clipping. MapLibre maxBounds separately restricts the camera.

Rust owns geographic predicates, coordinate transforms, bounding-box area calculations, tile grid generation and GeoJSON feature culling. JS owns MapLibre rendering, HTTP requests, browser preferences and minimal browser integration. The inspection grid is drawn using a transparent canvas above the map, using tile geometry produced by Rust/WASM; it is not a data-serving layer and makes no additional requests. Canvas rendering avoids z-order and `style.load` lifecycle dependencies that previously hid the grid.

## Provider adapters

Basemap runtime configuration lives in web/app.js. Source provenance and live verification remain authoritative in docs/sources/catalog.json. The [place and data-source ontology](ontology/README.md) separately defines place types, study rectangles, datasets, source-to-layer bindings, geographic ID namespaces, measure semantics, and join rules. All 16 cataloged sources have an ontology binding, including inactive candidates; this is metadata, not a new fetch engine. Geographic requests intersect the viewport and selected study rectangle instead of automatically downloading entire jurisdictions.

Census and zoning adapters query actual hosted public GIS/API services, use Rust/WASM for geospatial filtering and tract-statistic joins, and preserve already retrieved features during layer toggles, map-style changes and zoom-out. New requests require their source-specific detailed zoom, but existing geography is not discarded below it. Census request envelopes are recursively subdivided when provider output is capped, without an arbitrary total-call cutoff; up to three requests run concurrently, with depth and viewport constraints. Completed envelopes form a bounded geometric coverage index, so pans request only uncovered strips. Geometry is drawn before statistical enrichment finishes, with two bounded concurrent statistics batches. Memory-retained geography remains finite; there is no complete county mirror. `filter_geojson_bbox` filters intersecting feature extents rather than clipping polygon vertices.

## Caching

Basemap tiles use fetch with browser default HTTP caching, honoring provider Cache-Control/Expires/ETag. User selection does not download an entire study region and does not prefetch future zoom levels. Browser caches may be evicted.

Implemented: public geographic JSON requests use optional IndexedDB caching with versioned namespaces and per-source retention ceilings, bounded by upstream HTTP directives, and 192-record/24 MiB capacity. A clear-cache control is available. Basemap tiles remain in the browser's ordinary HTTP cache. No persistent data server is required. See [CACHE.md](CACHE.md).

## HUD appearance and system integration

`web/hud-theme.js` applies the saved `system`, `light`, or `dark` mode before CSS is loaded. In `system` mode it watches `matchMedia("(prefers-color-scheme: dark)")` for browser-reported OS changes, including supported Linux XDG portal configurations. The preference is stored locally under `stratlas:hudTheme`; invalid or unavailable storage defaults to system.

The selected effective theme only changes HUD CSS variables: sidebar panels, form controls, legends, status chips and MapLibre navigation chrome. It never calls MapLibre's `setStyle`, modifies map data-layer paint, restarts the tile protocol, or changes the orange XYZ grid. Chromium tests exercise both media preferences, manual overrides, reload persistence and unchanged map-stage background.

## Explicitly pending integrations

- Census/TIGERweb overlay adapters are implemented, but end-to-end *live* Census browser verification remains pending in the source catalog.
- Electoral aggregates, household wealth data, market transaction prices, and Mexico-specific statistical overlays are not implemented. Research portals in the catalog are not active providers.
- Further place ontologies may add official jurisdiction polygons and identifiers, but existing named study rectangles must not be mislabeled as legal administrative boundaries.

Data source coverage and implementation status are tracked in the [source registry](sources/README.md); source-to-layer meaning and observations are tracked in the [ontology](ontology/README.md).

## Scale-aware geographic presentation and visible caching

The separate `web/overview.js` adapter uses server-computed zoning counts and parcel-value statistics in at most nine repeatable bounding cells at wide zoom. It uses actual TIGERweb county polygons and Census Reporter county ACS values for a county-wide Census view. The original detailed loaders remain responsible for tract, zoning polygon and individual parcel geometry near street zoom. Overview shading is labeled as aggregate geography and does not represent parcels or legal districts. Detail appears only when meaningful, but the user can enable layers without meeting a minimum zoom cutoff.

`web/data-cache.js` separates stored geographic response bodies from lightweight IndexedDB metadata for efficient eviction and live readouts. Provider Cache-Control may still forbid persistence, and tiles are cached by the browser separately. The sidebar reports real cache usage and hits rather than only claiming that caching exists.
