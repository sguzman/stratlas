# Data sources and map-layer connections

The [source catalog](../sources/catalog.json) provides the authoritative provider URL, attribution, terms, geographic coverage, caching restrictions, and verification state. The [bindings manifest](sources.json) records which datasets, feature IDs, and visual layers use each source.

**Source counts:** 8 basemaps, 3 geographic feature APIs, 1 statistical API, and 4 disconnected research candidates. Registering an entry does not mean data is already loaded.

## Overview

| Source | ID | Category | Current state | Coverage |
| --- | --- | --- | --- | --- |
| OpenStreetMap Standard | `osm` | Raster basemap | Implemented (not separately live-verified) | global |
| OpenTopoMap | `opentopomap` | Raster basemap | Implemented (not separately live-verified) | global, partial |
| USGS The National Map Topographic | `usgs-topo` | Raster basemap | Live-browser verified | Primarily U.S. with some global overview |
| USGS Shaded Relief | `usgs-relief` | Raster basemap | Live-browser verified | Primarily U.S. elevation, global context less detailed |
| USGS Orthoimagery | `usgs-imagery` | Raster basemap | Live-browser verified | Primarily U.S. NAIP aerial imagery |
| CARTO Voyager | `carto-voyager` | Raster basemap | Implemented; user key needed | global, partial |
| CARTO Positron | `carto-positron` | Raster basemap | Implemented; user key needed | global, partial |
| CARTO Dark Matter | `carto-dark` | Raster basemap | Implemented; user key needed | global, partial |
| LA City Department of City Planning zoning | `la-zoning` | Spatial feature API | Live-browser verified | Los Angeles City; visible study area |
| U.S. Census Bureau TIGERweb 2024 census tracts | `tiger-tracts` | Spatial feature API | Implemented; live browser QA pending | Pilot: Los Angeles County; visible study area |
| Census Reporter 2020–2024 ACS five-year tabulations | `acs2024` | Statistical tabulation API | Implemented; live browser QA pending | Pilot: visible Los Angeles County tract GEOIDs |
| Los Angeles County Assessor parcels and tax-roll assessments | `lacounty-assessor-parcels` | Spatial feature API | Live-browser verified | Pilot: parcel polygons inside visible Los Angeles County study rectangle |
| Los Angeles GeoHub | `la-geohub` | Research candidate | Research candidate; not connected | Los Angeles |
| LA County Planning GIS | `la-county-planning` | Research candidate | Research candidate; not connected | Los Angeles County |
| INEGI 2020 census | `inegi-census` | Research candidate | Research candidate; not connected | Mexico |
| INE election results | `ine-elections` | Research candidate | Research candidate; not connected | Mexico |

## What is actually pulled into the map?

**Thematic controls:** Zoning, Census metrics, and assessed land values share one **Geographic data to display** selector; only one thematic data layer is active at a time. Wide-area source statistics appear in the HUD as labeled numbers, not as false zoning/parcel shapes. The source-specific polygons remain available on close zoom.

**Basemaps:** One selected raster basemap supplies only currently relevant tile images. The tile layer is a visual background, not a source of numerical elevation or population measurements. CARTO entries require a user-provided key. USGS coverage is principally United States geography.

**Zoning:** The LA City Planning API provides visible zoning feature IDs, then source polygons with provider-supplied `Zoning` and `CATEGORY` attributes. Stratlas draws colored categories with a legend and hover highlight. Only the provider's served jurisdiction is covered.

**Census geography and statistics:** TIGERweb supplies Los Angeles County tract shapes identified by `GEOID`. Census Reporter supplies 2020–2024 ACS aggregate estimates, keyed by `14000US` plus the tract GEOID. The two datasets are joined, never treated as interchangeable. Their adapters exist, but live Census browser QA is still pending.

**Parcels:** LA County Assessor supplies the visible parcel boundaries, `AIN`, roll year, and assessed land/improvement values. The map uses these as tax-roll amounts, **not sale prices or market valuations**.

**Research candidates:** Cataloged portals are *not connected*. There are no automatic downloads from them.

## Source-by-source provenance

### OpenStreetMap Standard

- **Source ID:** `osm`. **Type:** Raster basemap. **State:** Implemented (not separately live-verified).
- **Coverage:** global. **Vintage:** updated continuously.
- **Link:** [Provider endpoint or discovery page](https://tile.openstreetmap.org/{z}/{x}/{y}.png).
- **Attribution:** © OpenStreetMap contributors. [Access/usage reference](https://operations.osmfoundation.org/policies/tiles/).
- **Used by:** `web/app.js` → `basemap` layer; identity `osm` / `z/x/y`.  
-  **Cache:** normal HTTP cache; no prefetch.


### OpenTopoMap

- **Source ID:** `opentopomap`. **Type:** Raster basemap. **State:** Implemented (not separately live-verified).
- **Coverage:** global, partial. **Vintage:** updated by provider.
- **Link:** [Provider endpoint or discovery page](https://tile.opentopomap.org/{z}/{x}/{y}.png).
- **Attribution:** © OpenTopoMap / OpenStreetMap / SRTM. [Access/usage reference](https://opentopomap.org/).
- **Used by:** `web/app.js` → `basemap` layer; identity `opentopomap` / `z/x/y`.  
-  **Cache:** normal HTTP cache; no prefetch.


### USGS The National Map Topographic

- **Source ID:** `usgs-topo`. **Type:** Raster basemap. **State:** Live-browser verified.
- **Coverage:** Primarily U.S. with some global overview. **Vintage:** Service refreshed September 2026; source vintage varies.
- **Link:** [Provider endpoint or discovery page](https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}) · [Provider metadata](https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer).
- **Attribution:** USGS The National Map and component data providers. [Access/usage reference](https://apps.nationalmap.gov/services/).
- **Used by:** `web/app.js` → `basemap` layer; identity `usgs-topo` / `z/x/y`.  
-  **Cache:** Normal browser HTTP tile caching; no bulk prefetch.
- **Retrieval limits:** Native raster detail to z16, browser overzoom beyond.
- **Live verification evidence:** [GitHub Actions run](https://github.com/sguzman/stratlas/actions/runs/39455254611); passing tests show sampled browser access, not total coverage.

### USGS Shaded Relief

- **Source ID:** `usgs-relief`. **Type:** Raster basemap. **State:** Live-browser verified.
- **Coverage:** Primarily U.S. elevation, global context less detailed. **Vintage:** Service refreshed September 2025; 3DEP vintages vary.
- **Link:** [Provider endpoint or discovery page](https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}) · [Provider metadata](https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer).
- **Attribution:** USGS The National Map 3DEP and EROS GMTED2010. [Access/usage reference](https://apps.nationalmap.gov/services/).
- **Used by:** `web/app.js` → `basemap` layer; identity `usgs-relief` / `z/x/y`.  
-  **Cache:** Normal browser HTTP tile caching; no bulk prefetch.
- **Retrieval limits:** Shaded relief is not numeric elevation; native detail to z16. Some ocean/unsupported tiles return 404 and are displayed as empty coverage.
- **Live verification evidence:** [GitHub Actions run](https://github.com/sguzman/stratlas/actions/runs/39455254611); passing tests show sampled browser access, not total coverage.

### USGS Orthoimagery

- **Source ID:** `usgs-imagery`. **Type:** Raster basemap. **State:** Live-browser verified.
- **Coverage:** Primarily U.S. NAIP aerial imagery. **Vintage:** Image acquisition dates vary; service refreshed June 2024.
- **Link:** [Provider endpoint or discovery page](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}) · [Provider metadata](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer).
- **Attribution:** USGS The National Map and USDA NAIP. [Access/usage reference](https://apps.nationalmap.gov/services/).
- **Used by:** `web/app.js` → `basemap` layer; identity `usgs-imagery` / `z/x/y`.  
-  **Cache:** Normal browser HTTP tile caching; no bulk prefetch.
- **Retrieval limits:** Not live satellite imagery; native detail to z16.
- **Live verification evidence:** [GitHub Actions run](https://github.com/sguzman/stratlas/actions/runs/39455254611); passing tests show sampled browser access, not total coverage.

### CARTO Voyager

- **Source ID:** `carto-voyager`. **Type:** Raster basemap. **State:** Implemented; user key needed.
- **Coverage:** global, partial. **Vintage:** provider managed.
- **Link:** [Provider endpoint or discovery page](https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png).
- **Attribution:** © CARTO / © OpenStreetMap contributors. [Access/usage reference](https://carto.com/attributions).
- **Used by:** `web/app.js` → `basemap` layer; identity `carto-voyager` / `z/x/y`.  
-  **Cache:** normal HTTP cache.


### CARTO Positron

- **Source ID:** `carto-positron`. **Type:** Raster basemap. **State:** Implemented; user key needed.
- **Coverage:** global, partial. **Vintage:** provider managed.
- **Link:** [Provider endpoint or discovery page](https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png).
- **Attribution:** © CARTO / © OpenStreetMap contributors. [Access/usage reference](https://carto.com/attributions).
- **Used by:** `web/app.js` → `basemap` layer; identity `carto-positron` / `z/x/y`.  
-  **Cache:** normal HTTP cache.


### CARTO Dark Matter

- **Source ID:** `carto-dark`. **Type:** Raster basemap. **State:** Implemented; user key needed.
- **Coverage:** global, partial. **Vintage:** provider managed.
- **Link:** [Provider endpoint or discovery page](https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png).
- **Attribution:** © CARTO / © OpenStreetMap contributors. [Access/usage reference](https://carto.com/attributions).
- **Used by:** `web/app.js` → `basemap` layer; identity `carto-dark` / `z/x/y`.  
-  **Cache:** normal HTTP cache.


### LA City Department of City Planning zoning

- **Source ID:** `la-zoning`. **Type:** Spatial feature API. **State:** Live-browser verified.
- **Coverage:** Los Angeles City; visible study area. **Vintage:** live mutable dataset.
- **Link:** [Provider endpoint or discovery page](https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15/query) · [Provider metadata](https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15).
- **Attribution:** City of Los Angeles, Department of City Planning. [Access/usage reference](../sources/catalog.json).
- **Used by:** `web/zoning.js` → `zoning` layer; identity `la-city-planning-feature-server-15` / `OBJECTID`.  **Measurement IDs:** `zoning_designation`, `zoning_category`.
- **Requested/documented fields:** `OBJECTID`, `Zoning`, `CATEGORY`. **Cache:** Up to six hours for ID lookups and polygon GeoJSON, capped by provider directives; browser session retains polygons by OBJECTID.
- **Retrieval limits:** Viewport-scoped ArcGIS returnIdsOnly discovery; missing geometries retrieved in 40-ID batches with three concurrent requests, published progressively; no fixed total request cutoff.
- **Live verification evidence:** [GitHub Actions run](https://github.com/sguzman/stratlas/actions/runs/39455254611); passing tests show sampled browser access, not total coverage.

### U.S. Census Bureau TIGERweb 2024 census tracts

- **Source ID:** `tiger-tracts`. **Type:** Spatial feature API. **State:** Implemented; live browser QA pending.
- **Coverage:** Pilot: Los Angeles County; visible study area. **Vintage:** January 2024 vintage.
- **Link:** [Provider endpoint or discovery page](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/8/query) · [Provider metadata](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/8).
- **Attribution:** U.S. Census Bureau. [Access/usage reference](https://www.census.gov/data/developers/about/terms-of-service.html).
- **Used by:** `web/census.js` → `census` layer; identity `us-census-tigerweb-acs2024` / `GEOID`.  
- **Requested/documented fields:** `GEOID`, `BASENAME`, `STATE`, `COUNTY`. **Cache:** up to 30 days unless response directives restrict.
- **Retrieval limits:** Provider query asks for up to 251 tracts; >250 or truncation triggers viewport-bounded subdivision up to depth 6; at most 3 concurrent geographic requests, no fixed total per-navigation request cutoff.

### Census Reporter 2020–2024 ACS five-year tabulations

- **Source ID:** `acs2024`. **Type:** Statistical tabulation API. **State:** Implemented; live browser QA pending.
- **Coverage:** Pilot: visible Los Angeles County tract GEOIDs. **Vintage:** 2020–2024 estimates.
- **Link:** [Provider endpoint or discovery page](https://api.censusreporter.org/1.0/data/show/acs2024_5yr) · [Provider metadata](https://github.com/censusreporter/census-api/blob/master/API.md).
- **Attribution:** U.S. Census Bureau ACS estimates via Census Reporter. [Access/usage reference](https://github.com/censusreporter/census-api).
- **Used by:** `web/census.js` → `census` layer; identity `census-reporter-acs2024` / `geo_id`. **Statistical join:** To `tiger-tracts`; prefix '14000US' to 11-digit tract GEOID. **Measurement IDs:** `median_household_income`, `median_household_income_moe`, `tract_population`, `female_share`, `hispanic_share`, `nonhispanic_white_alone_share`.
- **Requested/documented fields:** `B19013_001`, `B01001_001`, `B01001_026`, `B03002_001`, `B03002_012`, `B03002_003`. **Cache:** up to 90 days unless response directives restrict.
- **Retrieval limits:** Batches of up to 40 visible GEOIDs, two concurrent requests; ACS sampling error and suppressed estimates.

### Los Angeles County Assessor parcels and tax-roll assessments

- **Source ID:** `lacounty-assessor-parcels`. **Type:** Spatial feature API. **State:** Live-browser verified.
- **Coverage:** Pilot: parcel polygons inside visible Los Angeles County study rectangle. **Vintage:** Parcel-specific Roll_Year from source (not a uniform current-year price).
- **Link:** [Provider endpoint or discovery page](https://cache.gis.lacounty.gov/cache/rest/services/LACounty_Cache/LACounty_Parcel/FeatureServer/0/query) · [Provider metadata](https://cache.gis.lacounty.gov/cache/rest/services/LACounty_Cache/LACounty_Parcel/FeatureServer/0).
- **Attribution:** Los Angeles County Office of the Assessor / LA County GIS. [Access/usage reference](../sources/catalog.json).
- **Used by:** `web/parcel.js` → `assessed_land_value` layer; identity `la-county-assessor-arcgis-feature-server-0` / `OBJECTID`.  **Measurement IDs:** `assessed_land_value`, `assessed_improvement_value`.
- **Requested/documented fields:** `OBJECTID`, `AIN`, `Roll_Year`, `Roll_LandValue`, `Roll_ImpValue`. **Cache:** HTTP/IndexedDB up to 24 hours, further restricted by source response directives; memory retains previously visited parcels.
- **Retrieval limits:** Region-bounded ArcGIS ID lookup; 35 missing parcel polygons per request, max 3 concurrent; 12,000 retained geometry features. Never a full county mirror.
- **Live verification evidence:** [GitHub Actions run](https://github.com/sguzman/stratlas/actions/runs/39455254611); passing tests show sampled browser access, not total coverage.

### Los Angeles GeoHub

- **Source ID:** `la-geohub`. **Type:** Research candidate. **State:** Research candidate; not connected.
- **Coverage:** Los Angeles. **Vintage:** Unspecified in the current entry.
- **Link:** [Provider endpoint or discovery page](https://geohub.lacity.org/).
- **Attribution:** Consult the original portal before integration. See [catalog](../sources/catalog.json) for terms.
- **Runtime:** None. This is a catalog-only research candidate.  
-  **Cache:** No live caching applies to a research-only candidate.


### LA County Planning GIS

- **Source ID:** `la-county-planning`. **Type:** Research candidate. **State:** Research candidate; not connected.
- **Coverage:** Los Angeles County. **Vintage:** Unspecified in the current entry.
- **Link:** [Provider endpoint or discovery page](https://planning.lacounty.gov/maps-and-gis/gis-data/).
- **Attribution:** Consult the original portal before integration. See [catalog](../sources/catalog.json) for terms.
- **Runtime:** None. This is a catalog-only research candidate.  
-  **Cache:** No live caching applies to a research-only candidate.


### INEGI 2020 census

- **Source ID:** `inegi-census`. **Type:** Research candidate. **State:** Research candidate; not connected.
- **Coverage:** Mexico. **Vintage:** 2020.
- **Link:** [Provider endpoint or discovery page](https://www.inegi.org.mx/programas/ccpv/2020/).
- **Attribution:** Consult the original portal before integration. See [catalog](../sources/catalog.json) for terms.
- **Runtime:** None. This is a catalog-only research candidate.  
-  **Cache:** No live caching applies to a research-only candidate.


### INE election results

- **Source ID:** `ine-elections`. **Type:** Research candidate. **State:** Research candidate; not connected.
- **Coverage:** Mexico. **Vintage:** election-specific.
- **Link:** [Provider endpoint or discovery page](https://www.ine.mx/voto-y-elecciones/resultados-electorales/).
- **Attribution:** Consult the original portal before integration. See [catalog](../sources/catalog.json) for terms.
- **Runtime:** None. This is a catalog-only research candidate.  
-  **Cache:** No live caching applies to a research-only candidate.



## Layer links

| Layer | Source IDs | How it renders | New-data zoom |
| --- | --- | --- | --- |
| Selected raster basemap (`basemap`) | `osm`, `opentopomap`, `usgs-topo`, `usgs-relief`, `usgs-imagery`, `carto-voyager`, `carto-positron`, `carto-dark` | single_raster | current map zoom |
| LA City zoning (`zoning`) | `la-zoning` | categorical_fill_with_highlight | 13 |
| LA County tract demographics (`census`) | `tiger-tracts`, `acs2024` | single_metric_choropleth | 12 |
| LA County tax-roll assessed land values (`assessed_land_value`) | `lacounty-assessor-parcels` | fixed_band_choropleth | 16 |

Source statuses and per-source restrictions are not inferred from a passing build of another provider. Every metropolitan specimen must document which portions of its region each local provider actually covers. See the [ontology model](MODEL.md), [measurements](MEASUREMENTS.md), and the [metropolitan specimen standard](../metropolises/STANDARD.md).
