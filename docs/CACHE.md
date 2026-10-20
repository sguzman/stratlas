# Persistent geographic API cache

Stratlas saves selected public geographic JSON API responses locally in IndexedDB. This is neither a worldwide data mirror nor a second basemap tile cache.

## Rules

- Each adapter first bounds queries by the live viewport, selected study rectangle, and provider coverage. The cache never initiates downloads outside those queries.
- Namespaces are versioned by dataset: TIGERweb ACS2024 tracts, Census Reporter ACS2024 five-year tabulations, LA City zoning, and LA County assessor parcels.
- Requested retention ceilings are 30 days for historical tract geometry, 90 days for fixed-release ACS statistics, 6 hours for potentially changing zoning, and 24 hours for assessor parcel roll responses. These are **maximums**: upstream Cache-Control max-age, Age, Expires, and no-store/private/no-cache/must-revalidate directives shorten or completely prohibit application caching.
- Individual entries are limited to 4 MiB. The database trims itself to 192 records and 24 MiB, evicting expired and older entries. Storage quotas and browser eviction are tolerated.
- HTTP uses the browser's default provider caching rules. No service worker, prefetch, full-county download, or opaque response interception.
- If IndexedDB is not available, the UI continues using network responses and the small in-session adapter caches.

## Inspect and clear

The Inspection panel now has **Clear cached study data**. This deletes the Stratlas-owned IndexedDB entries and clears Census/zoning/assessor in-memory query indexes. Existing currently displayed data remains visible; it reloads upon future navigation.

It does **not** clear OpenStreetMap or other basemap tiles from the browser's normal HTTP cache. It does not clear other sites or unrelated browser storage.

## Code and tests

- web/data-cache.js: IndexedDB driver and provider-aware JSON fetch.
- web/census.js, web/zoning.js and web/parcel.js: independent source-specific request bounds, validations and cache namespaces.
- tests/data-cache.test.mjs: reuse after reload, expiry, upstream directives, error handling, cancellation and response size tests.

Caching must be reconciled with provider policies. A saved browser response is never permission to redistribute provider content.
