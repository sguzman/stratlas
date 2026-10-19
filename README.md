# Stratlas

Rust/WebAssembly-first geographic research map. MapLibre renders the map; Rust performs geographic filtering, tile selection and statistical joins. External APIs supply data only for the visible part of a rectangular study region. No hosted geographic database.

**[Open Stratlas](https://sguzman.github.io/stratlas/)**

## Using the map

Choose a study rectangle and basemap. The optional XYZ tile grid outlines Web Mercator tiles above all basemaps and data overlays, using Rust/WASM geometry. Its enabled state survives reloads; at very high zoom its displayed grid level may be coarsened for clarity.

**Statistical overlays are disabled by default.** For a one-click example, select **Show LA income at tract scale** in Data Layers. New Los Angeles census estimates load at zoom 12+; new LA City zoning loads at zoom 13+. Previously loaded features stay visible when zooming out or toggling layers back on. This is *visited-area* coverage, not a full county download. Both are geographically limited pilots. The sidebar reports loading, errors, and source coverage.

## Development

Requires Rust stable, wasm32-unknown-unknown target, wasm-pack, and a local HTTP server. No npm or server-side database.

~~~sh
cargo test --workspace
wasm-pack build crates/stratlas-core --target web --out-dir ../../web/pkg
python3 -m http.server 8080 --directory web
~~~

Open http://localhost:8080/. GitHub Actions deploys updates from main.

## Reference

- [Architecture](docs/ARCHITECTURE.md)
- [Source registry](docs/sources/README.md) and [machine-readable data source catalog](docs/sources/catalog.json)
- [Census/ACS](docs/CENSUS.md) · [Zoning](docs/ZONING.md) · [Cache](docs/CACHE.md)

Detailed data provenance, licenses, coverage, and feature status belong in the source registry. This README is not a changelog.
