# Data provider catalog

## Basemap sources used

- OpenStreetMap Standard: https://tile.openstreetmap.org/ and https://operations.osmfoundation.org/policies/tiles/ . Visible tiles only; display attribution, send Referer, honor default HTTP caching, no scrape/prefetch.
- OpenTopoMap: https://tile.opentopomap.org/ . Show OpenTopoMap + OpenStreetMap + SRTM attribution, CC BY-SA. Community-funded; no bulk downloading.
- CARTO Voyager / Positron / Dark Matter: https://carto.com/basemaps/apikey/ . As of October 2026 a separate key is required for external raster basemaps. The viewer does not bundle one. CARTO and OSM attribution required. A browser-provided key is visible in network requests; do not mistake it for a secret.

Tile URLs, licensing and service limits may change; periodically verify provider policies.

## First API overlay (code integrated, browser QA pending)

Los Angeles City Department of City Planning zoning polygons: https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services/Zoning/FeatureServer/15 . The published layer supports GeoJSON and geographic queries, with `Zoning` and `CATEGORY` attributes and 2,000 maximum records per query. Activated only at zoom 13+, only within view/study/source intersection. See [ZONING.md](ZONING.md).

## Census demographics / income pilot (live browser QA pending)

- TIGERweb ACS2024 tract boundaries: https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2024/MapServer/8
- Census Reporter 2020–2024 ACS five-year estimates: https://api.censusreporter.org/1.0/data/show/acs2024_5yr
- Scope: visible LA County census tracts only, with geographic and count limits. See [CENSUS.md](CENSUS.md).

## Candidate overlays, not yet wired

- Additional LA City GeoHub land use: https://geohub.lacity.org/
- LA County planning GIS: https://planning.lacounty.gov/maps-and-gis/gis-data/
- US Census/ACS geographic statistics: https://www.census.gov/data/developers/data-sets/acs-5year.html
- Mexico INEGI 2020 census: https://www.inegi.org.mx/programas/ccpv/2020/
- Mexico INE elections: https://www.ine.mx/voto-y-elecciones/resultados-electorales/
- USGS topography: https://www.usgs.gov/3d-elevation-program

No adapter is considered functional until its public endpoint, query schema, CORS, license and geographic accuracy are verified from an actual browser. Income is not wealth; votes by precinct are not individual political affiliation; and municipal zoning is not generally available globally.
