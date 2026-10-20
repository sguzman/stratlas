# Places and map study windows

The [place registry](places.json) documents four named map presets and two parent country concepts. They are useful navigation and query limits, **not official administrative or metropolitan boundaries**. WGS84 coordinates use the order **west, south, east, north**.

## Named study windows

| Place | Place ID | Type | Preset | Bounding rectangle (W, S, E, N) |
| --- | --- | --- | --- | --- |
| **Los Angeles County** | `place:us:ca:los-angeles-county` | `county` | `la-county` | `-118.95`, `32.7`, `-117.64`, `34.85` |
| **Los Angeles City** | `place:us:ca:los-angeles-city` | `municipality` | `la-city` | `-118.67`, `33.7`, `-118.15`, `34.34` |
| **California** | `place:us:ca:california` | `state_or_province` | `california` | `-124.42`, `32.53`, `-114.13`, `42.02` |
| **Jalisco, Mexico** | `place:mx:jal:jalisco` | `state_or_province` | `jalisco` | `-105.72`, `18.88`, `-101.5`, `22.76` |

### Los Angeles County

Project place ID: `place:us:ca:los-angeles-county`. Parent concept: `place:us:ca:california`.

Study rectangle; Census pilot filters tract GEOIDs to state 06 and county 037.

Its rectangle is recorded as `-118.95`, `32.7`, `-117.64`, `34.85` in WGS84. It is an approximate viewport/study limit, not a definitive polygon for Los Angeles County.

### Los Angeles City

Project place ID: `place:us:ca:los-angeles-city`. Parent concept: `place:us:ca:los-angeles-county`.

Study rectangle; LA City zoning service itself controls jurisdiction.

Its rectangle is recorded as `-118.67`, `33.7`, `-118.15`, `34.34` in WGS84. It is an approximate viewport/study limit, not a definitive polygon for Los Angeles City.

### California

Project place ID: `place:us:ca:california`. Parent concept: `place:us`.

Basemap study preset; does not imply statewide Census/zoning/parcel API coverage.

Its rectangle is recorded as `-124.42`, `32.53`, `-114.13`, `42.02` in WGS84. It is an approximate viewport/study limit, not a definitive polygon for California.

### Jalisco, Mexico

Project place ID: `place:mx:jal:jalisco`. Parent concept: `place:mx`.

Basemap study preset; no Mexican statistical overlay is wired.

Its rectangle is recorded as `-105.72`, `18.88`, `-101.5`, `22.76` in WGS84. It is an approximate viewport/study limit, not a definitive polygon for Jalisco, Mexico.

## Parent place concepts

- **United States** (`place:us`): `country`; no study window is assigned directly to this parent concept.
- **Mexico** (`place:mx`): `country`; no study window is assigned directly to this parent concept.

## User-defined viewport

`viewport` is a local user-selected rectangle, persisted in the browser. It does not create an officially recognized place, assign an authoritative boundary, or automatically enqueue a metropolitan specimen.

## What is a metropolitan specimen?

A metropolis may include cities, counties, suburbs, and multiple planning or statistical jurisdictions. The Los Angeles metropolitan specimen is **not** equivalent to the Los Angeles City or County rectangles above. Its official metropolitan extent and constituent jurisdictions must be documented by an authoritative geographic source before declaring geographic completeness.

See the [metro standard](../metropolises/STANDARD.md), [Los Angeles specimen](../metropolises/los-angeles.md), and [machine-readable place registry](places.json).
