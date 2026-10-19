# Stratlas

A Rust/WebAssembly-first geographic research map that only requests visible tiles intersecting a selected **rectangular study region**. Deployed as a static GitHub Pages site. No hosted world-scale database.

**Planned site URL:** https://sguzman.github.io/stratlas/

## Implemented foundation

- Rust/WASM spatial engine: per-tile region intersection, Mercator/slippy conversions, spherical area estimates, interactive diagnostic tile grid, and GeoJSON feature culling.
- MapLibre GL JS GPU map rendering (not a custom GPU renderer).
- Rectangular regions: Los Angeles County, Los Angeles City, California, Jalisco, and a capture-the-current-viewport option. Administrative presets are approximate bounding rectangles, not exact jurisdictional polygons.
- Five selectable basemaps: OpenStreetMap, OpenTopoMap, and key-required CARTO Voyager/Positron/Dark Matter.
- Provider attribution, no prefetch, browser-native HTTP cache honoring provider headers.
- Region and map provider saved in the browser; optional CARTO key is saved locally only, never committed.
- GitHub Actions tests Rust, builds WASM, and publishes to GitHub Pages.

**Not yet implemented:** Census, zoning, elections, household wealth, land prices, and other statistical overlays. They require working, verified public API adapters; the UI does not invent datasets.

## Local setup

Requires Rust stable, the wasm32-unknown-unknown target, wasm-pack, and any local HTTP server.

1. Run: cargo test --workspace
2. Run: wasm-pack build crates/stratlas-core --target web --out-dir ../../web/pkg
3. Run: python3 -m http.server 8080 --directory web
4. Open http://localhost:8080/

Direct file:// opening does not support WebAssembly modules properly. No npm/Node dependency is required. MapLibre assets are pinned to version 5.5.0 and loaded from jsDelivr.

## GitHub Pages

The workflow under .github/workflows/pages.yml runs on push to the **inspected repository default branch (main)** and via manual dispatch. To activate Pages, open Settings > Pages and choose GitHub Actions as the source. Check the Actions run and deployed URL. The presence of this workflow does not itself prove Pages is enabled or the deployment succeeded.

## Principles

1. API-first, region-first, and incremental. Only map-visible, in-region tiles.
2. Keep coordinate math, aggregation, feature queries and filtering in Rust/WASM. MapLibre does GPU rendering; JS is the browser adapter.
3. Honor HTTP cache headers, provider attribution, CORS, API keys, usage quotas and data licenses. Never bulk-prefetch community tiles.
4. No actual user data, private keys, commercial map assets or scraped archives in Git.
5. Every future overlay must publish provenance, source date, units, resolution, and coverage. Wealth is not income; election aggregates are not individual affiliations.

See docs/ARCHITECTURE.md and docs/DATA_SOURCES.md.
