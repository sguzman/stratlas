# Los Angeles Census overlay

## Public sources and geography

- Boundaries: US Census Bureau TIGERweb ACS2024 MapServer layer 8 (Census Tracts), January 2024 vintage: https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/8
- Statistics: Census Reporter 2020–2024 American Community Survey five-year release (acs2024_5yr): https://api.censusreporter.org/1.0/data/show/acs2024_5yr
- Tables: B19013 median household income, B01001 population and sex, B03002 race and Hispanic/Latino ethnicity.
- First geography: Los Angeles County census tracts, state FIPS 06, county FIPS 037.

The Census Bureau's own Data API now requires a key; Census Reporter allows a keyless browser-side integration. Browser integration and CORS support still need explicit live QA. No dataset is committed to the repository.

## Request lifecycle

Disabled by default. When enabled **below zoom 12**, request a **Los Angeles County overview**, using the TIGERweb ACS2024 **Counties layer 82** for actual county geometry and Census Reporter county-level ACS estimates keyed by `05000US06037`. This is a source-backed county summary, not a fabricated aggregation of tract medians. It cannot be treated as Los Angeles City or full metropolitan statistics, and does not run for a study rectangle smaller than the county coverage. At zoom 12+, request individual tract geometry only from the intersection of the visible viewport, active study rectangle and LA County coverage. Rectangle coordinates are snapped to a small stable grid for better cache reuse, then strictly intersected again with the study and provider scope. TIGERweb only returns selected county tracts.

Each TIGERweb request asks for at most 251 records. When the response contains more than 250 tracts (or explicitly reports a transfer limit), Stratlas recursively divides **only the visible query rectangle** and loads the smaller pieces. The 250-tract threshold now triggers subdivision, **not a fatal overlay error**. There is **no fixed per-navigation request-count budget**. A maximum of **three concurrent geographic requests**, zoom/viewport restrictions, provider cancellation, and a maximum subdivision depth of six control service load. If a source continues truncating at the finest permitted subdivision, that pocket is reported incomplete rather than silently treated as complete. Independent geographic rectangles are retrieved concurrently rather than serializing every network delay. Successful subregions are remembered as coverage rectangles so subsequent camera pans query only new geography. Returned features deduplicate by stable 11-digit GEOID. Previously visited geometries remain visible.

The county overview and tract-level choropleth have separate MapLibre layers; only the appropriate one is displayed for the zoom level. County population totals use a distinct county-scale legend. This changes **presentation detail** without dropping retained tract data.

Geometry is painted as soon as each subregion completes, initially gray when ACS values are not yet available. Statistical requests are made in groups of 40 GEOIDs with up to two concurrent requests; Rust/WASM joins each completed group immediately and the choropleth recolors progressively. A 140 ms trailing delay on camera move-end reduces churn. Independent failures keep previously completed results and allow later retry. Requests still stop when disabled or outside source coverage. Changing a displayed metric reuses collected tabulations.

The browser retains bounded geographic coverage rectangles (up to 128) and memoizes tract tabulations for the session, plus up to 3,000 retained census tracts already visited. Toggling or changing metrics reuses them without a request, and zooming out no longer erases them. If retention reaches its limit, old records can be evicted and their coverage index is invalidated to avoid falsely claiming complete geography. Optional IndexedDB persistence caches public JSON responses at most 30 days for 2024 tract geometry and 90 days for the fixed 2020–2024 ACS release, or **less** when upstream HTTP directives require it. See [CACHE.md](CACHE.md).

## Measures and limitations

- Median household income: B19013_001 estimate, nominal USD, and 90% margin of error.
- Population: B01001_001 (persons per tract, not population density).
- Female proportion: B01001_026 divided by B01001_001.
- Hispanic/Latino share: B03002_012 / B03002_001.
- Non-Hispanic White-alone share: B03002_003 / B03002_001.

Rust maps missing and Census-suppressed values to null, never a fake zero. Fixed thematic color thresholds are used, so viewport changes do not distort the scale. Gray means unavailable or suppressed. The clickable tract popup includes all estimates, its income margin of error when available, and vintage.

This is sample-based 2020–2024 ACS data, not a 2026 snapshot, a measurement of household wealth, or individual-level attributes. Tract estimates can have substantial uncertainty.

## Automated verification

Rust unit tests check numeric normalization, suppression, missing records and percentage denominators. Node mocked-provider tests ensure opt-in network use, geographic bounds, correct GEOID requests, no refetch on metric change, automatic geographic subdivision, progressive rendering, partial-provider safeguards, and incremental panning coverage. Live browser/provider QA remains a separate step.
