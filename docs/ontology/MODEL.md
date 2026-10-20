# Geographic knowledge model

The [machine-readable vocabulary](model.json) defines the meaning of Stratlas data. The map is the **presentation layer**; a source is the original publisher or service; a dataset is a collection of geographic information; a measurement is an observation or classification at a documented scale and time.

This model prevents one municipality's zoning polygon, a metropolitan area's identity, a statistical tract, and a map tile from being treated as equivalent things.

## Entity types

| Entity | Meaning |
| --- | --- |
| `place` | Named geographic entity with a stable identity; not interchangeable with a map rectangle. |
| `study_window` | WGS84 bounding rectangle used to bound requests, not an authoritative administrative boundary. |
| `spatial_feature` | Provider-identified geometry representing a tract, land parcel or zoning feature. |
| `observation` | A measurement or classification attached to a spatial feature, with units, vintage, method and source. |
| `dataset` | A provider-maintained collection of spatial features, tabulations, or raster tile images. |
| `source` | A publisher-accessible API, service or discovery portal described by a catalog ID. |
| `map_layer` | Presentation of source data as a basemap, fill, line, label or thematic choropleth. |

## Types of geographic places and features

These describe different scales or objects. Their identifiers and boundary definitions must come from their own sources.

| Type | Description |
| --- | --- |
| `country` | Sovereign-state geographic concept; geometry requires an authority and vintage. |
| `state_or_province` | First-order administrative unit such as California or Jalisco. |
| `county` | County-level administrative unit; Los Angeles County is a study preset. |
| `municipality` | City or equivalent local administrative jurisdiction; Los Angeles City is a study preset. |
| `census_tract` | Statistical enumeration geography with a vintage and provider GEOID. |
| `cadastral_parcel` | Assessor parcel feature identified inside a source, not a household or person. |
| `zoning_feature` | Planning-designation polygon, which may overlap or relate to parcels. |
| `electoral_district` | Future election aggregation geography; no electoral layer is currently implemented. |
| `web_mercator_tile` | Rendering cell keyed by integer z/x/y, not a political or administrative place. |

## Relationships

A relationship documents how two pieces of geographic knowledge are connected; sharing a nearby location does not establish an identity join.

| Relationship | From → to | Meaning |
| --- | --- | --- |
| `has_study_window` | `place` → `study_window` | Project viewport preset linked to a named place, without asserting boundary equality. |
| `covers` | `dataset` → `place` | Dataset's documented jurisdiction or study coverage; not a proof of complete geographic availability. |
| `contains_feature` | `dataset` → `spatial_feature` | Dataset publishes features identified in that provider's namespace. |
| `observes` | `observation` → `spatial_feature` | Measurement describes one geographic feature at a stated vintage. |
| `provided_by` | `dataset` → `source` | Source endpoint distributes dataset content. |
| `derived_from` | `observation` → `dataset` | Derived statistical value retains a trace to its source dataset/table. |
| `joined_on` | `dataset` → `dataset` | Declared join between tabulations and geometry, using an explicit external identifier rule. |
| `renders` | `map_layer` → `dataset` | A map layer displays a source dataset without taking ownership of it. |
| `intersects` | `spatial_feature` → `study_window` | Bounding-box intersection used for discovery/rendering, not containment. |

## Source and delivery types

**Source kinds** describe the source's role. **Delivery kinds** describe how information reaches the browser.

| Source kind | Meaning |
| --- | --- |
| `raster_basemap` | Rendered tile pictures for cartographic context, not queryable per-pixel semantic facts. |
| `vector_feature_api` | API for spatial features and source attributes (e.g. ArcGIS GeoJSON). |
| `statistical_tabulation_api` | Aggregate statistics keyed to published geography IDs; can be joined to features. |
| `discovery_candidate` | Potential portal or provider with no wired application adapter or validated endpoint. |

| Delivery kind | Meaning |
| --- | --- |
| `xyz_raster_tile` | Browser-requested z/x/y raster tile URL. |
| `arcgis_cached_tile` | Cached ArcGIS MapServer tiles in z/y/x URL order. |
| `arcgis_geojson` | ArcGIS feature IDs and selected GeoJSON geometries/attributes. |
| `tabulation_json` | Structured aggregate estimates keyed to an external geography ID. |
| `not_connected` | No runtime endpoint is connected; catalog entry is research only. |

## Time and validity

| Time model | Meaning |
| --- | --- |
| `provider_updated` | Service content can change independently of app releases; per-feature dates may differ. |
| `fixed_geography_vintage` | Geometry boundaries refer to a specific named release. |
| `survey_period` | Sample-based estimates cover a multi-year period, not a single point in time. |
| `per_feature_roll_year` | Assessment year is attached to each property record. |
| `not_specified` | Provider vintage is not known at this ontology resolution. |

A data vintage cannot be inferred from today's date. A census survey period, a parcel assessment roll year, and a provider's update timestamp are different types of temporal evidence.

## Identity and interpretation rules

- External identifiers are scoped to their source namespace and dataset vintage.
- Never substitute an internal source OBJECTID for a cross-provider stable identifier.
- A study window's rectangle never asserts administrative boundary equality.
- Preserve observation vintage, units, population denominator and missing/suppressed status.
- An unimplemented discovery candidate is not a live data source.

Read [Places](PLACES.md) for project study windows, [Measurements](MEASUREMENTS.md) for units and data semantics, [Sources](SOURCES.md) for source-to-layer bindings, and the [Los Angeles specimen](../metropolises/los-angeles.md) for a worked example. For exact IDs and machine validation, use the linked JSON files.
