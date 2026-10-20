# Stratlas

Rust/WebAssembly-first geographic research map. MapLibre renders the map; Rust performs geographic filtering, tile selection and statistical joins. External APIs supply data only for the visible part of a rectangular study region. No hosted geographic database.

**[Open Stratlas](https://sguzman.github.io/stratlas/)**

## Using the map

Choose a study rectangle and basemap. The optional XYZ tile grid outlines Web Mercator tiles above all basemaps and data overlays, using Rust/WASM geometry. Its enabled state survives reloads; at very high zoom its displayed grid level may be coarsened for clarity. Grid lines remain below MapLibre attribution, navigation controls, and popups.

**Data overlays are optional and available at broad map scales.** At wide zoom, Stratlas requests **server-side zoning/assessor summaries** and a **county-level ACS summary**, rather than downloading an entire metropolis of detailed polygons. At closer zoom, it progressively retrieves individual census tracts (12+), zoning polygons (13+), and assessor parcels (16+). Source limitations are shown in the sidebar. The Inspection panel displays actual locally stored API cache size, reuse counts, network responses, and provider-disabled caching. These summaries are not full metro coverage or a substitute for individual geometry. Previously retrieved detailed features remain in memory.

## HUD appearance

The **Appearance → HUD color theme** selector has **System** (default), **Light**, and **Dark** modes. The browser's `prefers-color-scheme` media query controls System mode, which updates when the browser reports an OS theme change; manual overrides are saved in browser local storage. For darkman on Linux, the XDG desktop Settings portal must forward its light/dark preference to Chromium or another browser. Stratlas cannot read darkman's private process or socket directly.

Only HUD surfaces (sidebar, labels, legends, status chips, and map navigation chrome) change. **Basemap imagery, geographic features and classifications, polygon fill colors, the tile grid, and geographic source selection remain unchanged.** The appearance setting never requests extra GIS data.

## Development

Requires Rust stable, wasm32-unknown-unknown target, wasm-pack, and a local HTTP server. No npm or server-side database.

~~~sh
cargo test --workspace
wasm-pack build crates/stratlas-core --target web --out-dir ../../web/pkg
python3 -m http.server 8080 --directory web
~~~

Open http://localhost:8080/. GitHub Actions deploys updates from main.

## Reference

- [Constitution](CONSTITUTION.md) · [Agent guide](AGENTS.md)
- [Metropolitan specimen standard](docs/metropolises/STANDARD.md) · [Los Angeles specimen profile](docs/metropolises/los-angeles.md)
- [Queue policy](docs/queues/README.md) · [current queue status](docs/queues/STATUS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Place and data-source ontology](docs/ontology/README.md) · [readable places](docs/ontology/PLACES.md), [measurements](docs/ontology/MEASUREMENTS.md), and [sources](docs/ontology/SOURCES.md)
- [Machine-readable ontology](docs/ontology/model.json) · [source/layer bindings](docs/ontology/sources.json)
- [Source registry](docs/sources/README.md) and [machine-readable data source catalog](docs/sources/catalog.json)
- [Census/ACS](docs/CENSUS.md) · [Zoning](docs/ZONING.md) · [Assessed parcels](docs/PARCELS.md) · [Cache](docs/CACHE.md)

Detailed data provenance, licenses, coverage, and feature status belong in the source registry. This README is not a changelog.
