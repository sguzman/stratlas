# Data provider catalog

## Basemap sources used

- OpenStreetMap Standard: https://tile.openstreetmap.org/ and https://operations.osmfoundation.org/policies/tiles/ . Visible tiles only; display attribution, send Referer, honor default HTTP caching, no scrape/prefetch.
- OpenTopoMap: https://tile.opentopomap.org/ . Show OpenTopoMap + OpenStreetMap + SRTM attribution, CC BY-SA. Community-funded; no bulk downloading.
- CARTO Voyager / Positron / Dark Matter: https://carto.com/basemaps/apikey/ . As of October 2026 a separate key is required for external raster basemaps. The viewer does not bundle one. CARTO and OSM attribution required. A browser-provided key is visible in network requests; do not mistake it for a secret.

Tile URLs, licensing and service limits may change; periodically verify provider policies.

## Candidate overlays, not yet wired

- LA City GeoHub zoning and land use: https://geohub.lacity.org/
- LA County planning GIS: https://planning.lacounty.gov/maps-and-gis/gis-data/
- US Census/ACS geographic statistics: https://www.census.gov/data/developers/data-sets/acs-5year.html
- Mexico INEGI 2020 census: https://www.inegi.org.mx/programas/ccpv/2020/
- Mexico INE elections: https://www.ine.mx/voto-y-elecciones/resultados-electorales/
- USGS topography: https://www.usgs.gov/3d-elevation-program

No adapter is considered functional until its public endpoint, query schema, CORS, license and geographic accuracy are verified from an actual browser. Income is not wealth; votes by precinct are not individual political affiliation; and municipal zoning is not generally available globally.
