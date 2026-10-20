# Stratlas place and data-source ontology

Stratlas has two complementary parts: its **presentation layer** draws maps and lets visitors explore a study window; its **knowledge model** describes places, features, observations, datasets and sources. This directory defines the latter in machine-readable files. It is descriptive metadata, not a geographic data warehouse, a boundary collection, or a separate runtime.

## Canonical resources

| File | Responsibility |
| --- | --- |
| [model.json](model.json) | Controlled vocabulary: entity types, source/delivery kinds, identity rules, time models and relationships |
| [places.json](places.json) | The named study presets in the application; WGS84 rectangles with conceptual place identities |
| [sources.json](sources.json) | Every registered source linked to a dataset, feature type, identity namespace, adapter and presented map layer |
| [measurements.json](measurements.json) | Units, source field names, computed ratios, periods, assessment meanings and suppression rules |
| [source-bindings.schema.json](source-bindings.schema.json) | Formal JSON Schema for the source-to-layer manifest |
| [../sources/catalog.json](../sources/catalog.json) | **Authoritative provenance registry:** provider URL, attribution, access restrictions, date, cache policy and verification status |
| [../sources/README.md](../sources/README.md) | Human-facing provider inventory and status definitions |

Provider endpoints and licensing are defined **once** in the source registry; the ontology uses matching source IDs. No keys, actual provider datasets, response bodies, or cached geographic tiles belong in the repository.

## Entity model

A **place** is a named geographic concept such as a country, state/province, county, municipality, tract or parcel. A **study window** is an approximate rectangle used to limit camera motion and API requests: it is *not* the official administrative boundary of the place. The four named presets are Los Angeles County, Los Angeles City, California and Jalisco; the fifth Custom viewport is a runtime rectangle, not a named canonical place. Project-stable place IDs do not replace official provider identifiers.

A **spatial feature** is a provider's tract, parcel, zoning polygon, or tile, with an identifier local to that provider: zoning OBJECTID, assessor OBJECTID (AIN is an additional parcel attribute), Census 11-digit GEOID, or Web Mercator z/x/y tile. These identities are not interchangeable. A **measurement** attaches a classification, estimate or value to a feature, including its unit, source, period and interpretation. A **dataset** is a published collection of features or observations. A **source** is the API/service/portal that distributes data. A **map layer** is a browser presentation, not a data authority.

Relationships include: dataset **provided_by** source; dataset **contains_feature** spatial feature; observation **observes** a feature and is **derived_from** a dataset; layer **renders** a dataset; place **has_study_window** a rectangle; spatial feature **intersects** a window. Linking statistical observations to boundaries requires an explicit **joined_on** rule: shared display names or visual overlap are not identity joins.

## Source types and what Stratlas actually consumes

| Source kind | Retrieval | Registered sources |
| --- | --- | --- |
| **Raster basemap** (8) | Browser requests raster tiles for the selected basemap only | OpenStreetMap Standard (osm), OpenTopoMap (opentopomap), USGS topographic/relief/orthoimagery (usgs-topo, usgs-relief, usgs-imagery), CARTO Voyager/Positron/Dark (carto-voyager, carto-positron, carto-dark) |
| **Vector feature API** (3) | ArcGIS visible-area feature IDs and/or selected GeoJSON | LA City zoning (la-zoning), Census Bureau TIGERweb tract boundaries (tiger-tracts), LA County Assessor parcels (lacounty-assessor-parcels) |
| **Statistical tabulation API** (1) | Aggregate JSON estimates requested for Census tract GEOIDs | Census Reporter 2020–2024 ACS (acs2024) |
| **Discovery candidates** (4) | **No app requests.** Research entries without connected runtime endpoints | LA GeoHub (la-geohub), LA County Planning (la-county-planning), INEGI census (inegi-census), INE elections (ine-elections) |

Those are **16 registered sources**, not 16 simultaneous feeds. Eight are selectable basemaps (one at a time), four have connected data adapters, and four are research-only. CARTO tiles require a user key. Only the [catalog](../sources/catalog.json) establishes integration and live-verification status. Census/TIGERweb remain marked **browser QA pending**; successful zoning/parcel/USGS tests do not establish their behavior.

### Layers and new-retrieval thresholds

| Presentation | Source IDs | Feature identity | New requests |
| --- | --- | --- | --- |
| Raster basemap | Exactly one of the 8 basemap sources | Render tile z/x/y | Current zoom; tile requests clipped to study rectangle |
| LA City zoning | la-zoning | Planning polygon OBJECTID; categorical zoning designation | Zoom 13+ |
| Tract demographics | tiger-tracts **joined with** acs2024 | 2024 TIGER tract GEOID; 2020–2024 survey estimates | Zoom 12+ |
| Assessed land | lacounty-assessor-parcels | Assessor parcel OBJECTID/optional AIN; roll year and tax assessments | Zoom 16+ |

Thresholds govern **new retrieval**, not the display of already loaded data. All implemented source adapters respect viewport, study rectangle and provider coverage. They are opt-in or selected rather than pre-downloaded. Raster tiles use HTTP caching; eligible public JSON responses use bounded local IndexedDB under provider directives. Stratlas never claims ownership of provider content.

### Example: a Census join

1. TIGERweb supplies a feature with an 11-digit GEOID, for example 06037101010 (shown as an identifier-format illustration, not a processed place record).
2. Census Reporter uses a composite identifier formed by prefixing 14000US, yielding 14000US06037101010.
3. Rust/WASM joins B01001, B03002 and B19013 estimates to that tract's GeoJSON.
4. The choropleth displays the chosen measure; [measurements.json](measurements.json) preserves its numerator, denominator, unit, survey period and unavailable-value behavior.

ACS income is **not wealth**; tract aggregates are not individual attributes. Assessor land values are **tax-roll assessments, not market prices**. Shaded-relief images visually depict terrain but do not provide queryable numerical elevations.

## Maintenance

Add any source to the authoritative [catalog](../sources/catalog.json) before creating its ontology binding. Every catalog source has exactly one binding. Candidates remain not_connected and have no runtime module or dataset instantiated. An implemented layer declares its source IDs, identity namespace, place/feature type, minimum zoom, measures and any statistical join. Never invent missing records or mark future sources as downloaded.

Node tests check catalog/ontology foreign keys, layer wiring, study-window consistency and candidate isolation. Separate browser tests still verify external network integrations. These files are self-contained project documentation; inclusion in any external public registry is a separate, explicitly authorized governance decision.
