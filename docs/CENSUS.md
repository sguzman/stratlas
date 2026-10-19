# Los Angeles Census overlay

## Public sources and geography

- Boundaries: US Census Bureau TIGERweb ACS2024 MapServer layer 8 (Census Tracts), January 2024 vintage: https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/8
- Statistics: Census Reporter 2020–2024 American Community Survey five-year release (acs2024_5yr): https://api.censusreporter.org/1.0/data/show/acs2024_5yr
- Tables: B19013 median household income, B01001 population and sex, B03002 race and Hispanic/Latino ethnicity.
- First geography: Los Angeles County census tracts, state FIPS 06, county FIPS 037.

The Census Bureau's own Data API now requires a key; Census Reporter allows a keyless browser-side integration. Browser integration and CORS support still need explicit live QA. No dataset is committed to the repository.

## Request lifecycle

Disabled by default. When enabled at zoom 12+, request only the intersection of the visible viewport, active study rectangle and LA County coverage. Rectangle coordinates are snapped to a small stable grid for better cache reuse, then strictly intersected again with the study and provider scope. TIGERweb only returns selected county tracts.

Limit to 250 polygons. If the query exceeds this cap, refuse to show a misleading partial choropleth and tell the user to zoom closer. Only returned, valid 11-digit LA GEOIDs can trigger Census Reporter data requests, batched in groups of 40. Rust/WASM performs the authoritative tabulation join using the GEOID. Queries abort on navigation, style/region changes and disabling the layer. Metric switching does not initiate new requests.

The browser retains up to eight recent geometry query windows and memoizes tract tabulations for the session, plus up to 1,600 enriched census tracts already visited. Toggling or changing metrics reuses them without a request, and zooming out no longer erases them. The 250-tract *per-query* limit still protects against large automatic downloads; if exceeded, the viewer asks you to zoom closer while preserving existing polygons. Optional IndexedDB persistence caches public JSON responses at most 30 days for 2024 tract geometry and 90 days for the fixed 2020–2024 ACS release, or **less** when upstream HTTP directives require it. See [CACHE.md](CACHE.md).

## Measures and limitations

- Median household income: B19013_001 estimate, nominal USD, and 90% margin of error.
- Population: B01001_001 (persons per tract, not population density).
- Female proportion: B01001_026 divided by B01001_001.
- Hispanic/Latino share: B03002_012 / B03002_001.
- Non-Hispanic White-alone share: B03002_003 / B03002_001.

Rust maps missing and Census-suppressed values to null, never a fake zero. Fixed thematic color thresholds are used, so viewport changes do not distort the scale. Gray means unavailable or suppressed. The clickable tract popup includes all estimates, its income margin of error when available, and vintage.

This is sample-based 2020–2024 ACS data, not a 2026 snapshot, a measurement of household wealth, or individual-level attributes. Tract estimates can have substantial uncertainty.

## Automated verification

Rust unit tests check numeric normalization, suppression, missing records and percentage denominators. Node mocked-provider tests ensure opt-in network use, geographic bounds, correct GEOID requests, no refetch on metric change and safe over-limit behavior. Live browser/provider QA remains a separate step.
