# Los Angeles County assessed land values

## Public source and meaning

Official map service: [LA County GIS / Assessor parcel layer](https://cache.gis.lacounty.gov/cache/rest/services/LACounty_Cache/LACounty_Parcel/FeatureServer/0), served as ArcGIS FeatureServer layer 0. Published parcel records expose \`OBJECTID\`, assessor parcel identifier \`AIN\`, assessment year \`Roll_Year\`, \`Roll_LandValue\`, and \`Roll_ImpValue\`. No owners' names or mailing addresses are requested.

**These are tax-roll assessed values.** They are **not current market prices**, recent transaction prices, appraisals, or measurements of household wealth. California assessment rules and base-year history can produce considerable divergence from open-market value. Users should not infer a parcel's likely sale price from a color.

The color bands are fixed nominal USD thresholds, not dynamically re-normalized to the visible viewport. Missing, negative, and invalid land values are colored gray rather than misleadingly treated as zero. The click popup reports each parcel's published roll year, assessed land amount, and assessed improvement amount separately. Individual roll vintages can differ; no single "2026" data vintage is implied.

## Browser-only loading

Stratlas restricts the source to the **intersection** of the selected rectangular study region, visible viewport, and Los Angeles County pilot bounds. No outside features are prefetched. New parcel requests begin at zoom 16+, avoiding a county-wide parcel download.

The loader calls the ArcGIS \`returnIdsOnly=true\` API for intersecting parcel identifiers; then retrieves **only missing polygons** in groups of 35 with at most three simultaneous requests. As individual groups complete, geometry is added to MapLibre; visiting or zooming away retains successfully loaded parcels in browser memory. A moving camera prioritizes its newest viewport while older in-flight groups may complete. Missing IDs remain retryable.

The small ID-window cache retains at most 32 regions, and geometry memory retains up to 12,000 parcel polygons. HTTP/IndexedDB responses are stored only where provider policy permits, with a maximum requested local retention of 24 hours subject to stricter response headers. Disabling the layer prevents new requests and hides the polygons; it does not intentionally discard already retrieved geometry.

The boundary work is handled by Stratlas's Rust/WASM \`filter_geojson_bbox\`; MapLibre renders colored polygons and provides clickable inspection. Data processing remains entirely in the static site/browser, without a dedicated database or backend.

## UI and accessibility

A separate **LA County assessed land value** checkbox enables this optional overlay. Its sidebar legend labels all fixed value bands and the unavailable-data color. An opacity slider (default 66%) changes the fill without network requests, and the preference is retained locally.

## Source registry and validation

The authoritative catalog entry, access policy, coverage, and QA status live in [sources/catalog.json](sources/catalog.json). Unit tests mock the provider to check bounds, schema, batching, caching, errors, and progression. The CI workflow also checks the browser UI and queries the actual public provider in Chromium before marking deployment successful. External provider access, uptime, and source changes remain beyond Stratlas's control.
