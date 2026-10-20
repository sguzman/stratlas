# Persistent geographic API cache

Stratlas saves selected public geographic JSON API responses locally in IndexedDB. This is neither a worldwide data mirror nor a second basemap tile cache.

## Rules

- Each adapter first bounds queries by the live viewport, selected study rectangle, and provider coverage. The cache never initiates downloads outside those queries.
- Namespaces are versioned by dataset: TIGERweb ACS2024 tracts, Census Reporter ACS2024 five-year tabulations, LA City zoning, and LA County assessor parcels.
- Requested retention ceilings are 30 days for historical tract geometry, 90 days for fixed-release ACS statistics, 6 hours for potentially changing zoning, and 24 hours for assessor parcel roll responses. These are **maximums**: upstream Cache-Control max-age, Age, Expires, and no-store/private/no-cache/must-revalidate directives shorten or completely prohibit application caching.
- Individual entries are limited to 8 MiB. The database trims itself to 768 responses and 128 MiB, evicting expired and older entries. Storage quotas and browser eviction are tolerated. Its second IndexedDB object store contains **only lightweight cache metadata** (keys, sizes, timestamps) used for inspection and eviction; upgrading an older browser's v1 cache builds that index without discarding existing cached responses.
- HTTP uses the browser's default provider caching rules. No service worker, prefetch, full-county download, or opaque response interception.
- If IndexedDB is not available, the UI continues using network responses and the small in-session adapter caches.

## Visible cache status

The Inspection panel reports current IndexedDB response count and stored MiB, reuse hits in the current page session, completed geographic network responses, and responses that upstream Cache-Control prevents Stratlas from persisting. A nonzero network count does not mean the cache is disabled: responses may not have been seen before or may be excluded by provider terms. **Basemap raster tiles remain in the browser HTTP cache**, which is separate and not included in API-cache counters.

Wide-area summaries (ArcGIS statistics and county ACS) also use the same policy-aware cache, in separately versioned namespaces. The client queries only visible-area statistics, not an entire county of parcel geometries. Results can reuse visited geographic areas across navigations.

## Inspect and clear

The Inspection panel now has **Clear cached study data**. This deletes the Stratlas-owned IndexedDB entries and clears Census/zoning/assessor in-memory query indexes. Existing currently displayed data remains visible; it reloads upon future navigation.

It does **not** clear OpenStreetMap or other basemap tiles from the browser's normal HTTP cache. It does not clear other sites or unrelated browser storage.

## Code and tests

- web/data-cache.js: IndexedDB driver and provider-aware JSON fetch.
- web/census.js, web/zoning.js and web/parcel.js: independent source-specific request bounds, validations and cache namespaces.
- tests/data-cache.test.mjs: reuse after reload, expiry, upstream directives, error handling, cancellation and response size tests.

Caching must be reconciled with provider policies. A saved browser response is never permission to redistribute provider content.
