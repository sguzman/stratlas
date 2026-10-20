# Los Angeles metropolitan area — specimen profile

**Specimen ID:** `metro:us:ca:los-angeles`  
**Country:** United States; **region:** California  
**Current state:** Existing interactive **partial pilot**. Official metropolitan boundary: **not yet established**.  
**Queue status:** **Queued; not processed.** No downstream tasks have been instantiated for this specimen.

[Open the public map](https://sguzman.github.io/stratlas/) · [Source catalog](../sources/catalog.json) · [Specimen data](los-angeles.json) · [Shared metro standard](STANDARD.md) · [Queue status](../queues/STATUS.md)

## What area does this specimen mean?

This specimen refers to the **Los Angeles metropolitan area**, rather than just the City of Los Angeles or Los Angeles County. The existing map has separate Los Angeles City and County study rectangles, which limit browser requests but are **not authoritative metropolitan boundaries**. A metro-wide delimitation and constituent-jurisdiction inventory have not yet been established.

Existing, provider-backed zoning only covers the LA City jurisdiction served by its API; Assessor and Census adapters currently target Los Angeles County. Source coverage should not be represented as extending to the entire metropolitan area.

Project place references: `place:us:ca:los-angeles-city`, `place:us:ca:los-angeles-county`. These connect the current pilot to the [place registry](../ontology/PLACES.md), not to an official metro delineation.

## What is already available?

The table below reflects **pre-existing pilot work** recorded in the [specimen JSON](los-angeles.json). Its status is not a claim that the specimen-queue item was processed.

| Capability | Current status | Sources used | What visitors can see; remaining limitations |
| --- | --- | --- | --- |
| **Reference map and optional physical context** (`basemaps`) | Partial geographic coverage (`partial`) | [`osm`](../ontology/SOURCES.md), [`opentopomap`](../ontology/SOURCES.md), [`usgs-topo`](../ontology/SOURCES.md), [`usgs-relief`](../ontology/SOURCES.md), [`usgs-imagery`](../ontology/SOURCES.md), [`carto-voyager`](../ontology/SOURCES.md), [`carto-positron`](../ontology/SOURCES.md), [`carto-dark`](../ontology/SOURCES.md) | Selectable map sources work; USGS maps are U.S.-focused, CARTO key-dependent, and coverage varies. |
| **Metro identity and official area definition** (`metro_identity_and_boundaries`) | Partial geographic coverage (`partial`) | No feature source linked yet | Los Angeles City and County exist as named study windows; metropolitan delineation and municipality membership remain unverified. |
| **Planning designations and zoning** (`zoning_and_land_use`) | Partial geographic coverage (`partial`) | [`la-zoning`](../ontology/SOURCES.md) | LA City Planning polygons are live-browser verified for the city provider. Other metropolitan zoning jurisdictions are not covered. |
| **Population and demographic geography** (`population_and_demographics`) | Implemented; live QA pending (`implemented_unverified`) | [`tiger-tracts`](../ontology/SOURCES.md), [`acs2024`](../ontology/SOURCES.md) | Tract geometry and 2020–2024 ACS demographics are wired for the LA County pilot; independent live Census browser QA remains pending. |
| **Household income and inequality context** (`household_income`) | Implemented; live QA pending (`implemented_unverified`) | [`tiger-tracts`](../ontology/SOURCES.md), [`acs2024`](../ontology/SOURCES.md) | ACS median household income is wired for LA County tracts; not wealth, and live Census browser QA remains pending. |
| **Parcel geometry and identifiers** (`parcels_and_cadastre`) | Partial geographic coverage (`partial`) | [`lacounty-assessor-parcels`](../ontology/SOURCES.md) | LA County assessor parcel geometry is browser verified; a wider metropolitan-area jurisdiction audit remains pending. |
| **Land and improvement assessments** (`land_and_improvement_assessments`) | Partial geographic coverage (`partial`) | [`lacounty-assessor-parcels`](../ontology/SOURCES.md) | The County provider exposes source roll years and assessed land/improvement values. Not sale prices or current market valuation. |
| **Geographic retrieval, caching and verifiability** (`retrieval_caching_and_qa`) | Partial geographic coverage (`partial`) | No feature source linked yet | Runtime has bounded query/caching, Rust/WASM and live browser checks for zoning, parcels and USGS. Census live QA and metro-wide coverage remain pending. |

### Visual layers currently implemented

1. **Reference basemaps:** OSM, OpenTopoMap, USGS and optional-key CARTO alternatives. Different providers have different coverage and licensing.
2. **City zoning:** Source-supplied LA City planning categories, color legend, opacity, and hover highlighting. It does not yet represent zoning in every municipality of the metro.
3. **Tract demographics and household income:** TIGERweb tract polygons joined to 2020–2024 Census Reporter ACS estimates; implemented, but this Census flow still requires its own live-browser verification. Tract income is not household wealth.
4. **Assessed parcel land values:** LA County Assessor parcel boundaries and tax-roll amounts, with per-parcel assessment year. These values are not recent sale prices or current market valuations.

Existing tests verify zoning, parcel integration and USGS examples in Chromium; those checks do not demonstrate complete coverage of the metropolitan area or automatically prove the Census source.

## Source and geographic provenance

| Role | Provider | Area actually supported | Evidence |
| --- | --- | --- | --- |
| Planning/zoning (`la-zoning`) | City of Los Angeles, Department of City Planning | Los Angeles City; visible study area | `implemented-browser-verified`; [provider](https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15/query) |
| Census geography (`tiger-tracts`) | U.S. Census Bureau | Pilot: Los Angeles County; visible study area | `implemented-browser-qa-pending`; [provider](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/8/query) |
| Census statistical estimates (`acs2024`) | U.S. Census Bureau ACS estimates via Census Reporter | Pilot: visible Los Angeles County tract GEOIDs | `implemented-browser-qa-pending`; [provider](https://api.censusreporter.org/1.0/data/show/acs2024_5yr) |
| Parcel boundaries and assessments (`lacounty-assessor-parcels`) | Los Angeles County Office of the Assessor / LA County GIS | Pilot: parcel polygons inside visible Los Angeles County study rectangle | `implemented-browser-verified`; [provider](https://cache.gis.lacounty.gov/cache/rest/services/LACounty_Cache/LACounty_Parcel/FeatureServer/0/query) |

Full source permissions, vintages, and caching details appear in the human-readable [source directory](../ontology/SOURCES.md) and [machine-readable catalog](../sources/catalog.json). [Measurements](../ontology/MEASUREMENTS.md) explains units, denominators, and statistical versus assessment values.

## Still incomplete

- **Election result geography** (`electoral_results`): `not_implemented_for_los_angeles`.
- **Queryable numeric elevation** (`elevation_values`): `not_implemented_for_los_angeles`.
- **Actual property sales/transactions** (`market_transactions`): `not_implemented_for_los_angeles`.
- **Household net worth or validated wealth proxies** (`household_wealth`): `not_implemented_for_los_angeles`.
- **Infrastructure, transit and transport geography** (`infrastructure_and_mobility`): `not_implemented_for_los_angeles`.

In addition to these optional categories, metro boundary provenance, metro-wide source coverage, and Census live QA remain incomplete. Preserve these limits even if the map appears visually populated.

## Work authorization and specimen status

The [specimen intake record](../queues/specimens.json) is **queued**, with `specimen_processing=not_authorized` and `downstream_dispatch=not_created`. [Downstream task queues](../queues/tasks.json) are empty. This Markdown profile documents what already exists; it does **not** authorize source discovery, create tasks, process a queue, or certify completion.

Changes to the specimen's operational status must be explicitly authorized and reflected consistently in the JSON and this profile. The [constitution](../../CONSTITUTION.md) and [agent guidance](../../AGENTS.md) govern public information and work separation.
