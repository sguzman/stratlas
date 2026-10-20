# Metropolitan Specimen Standard

A metropolitan area is Stratlas's repeatable research unit. The [machine-readable capability contract](standard.json) describes the features expected for **every** metropolitan specimen; [the ontology](../ontology/README.md) defines what places, features, measurements, datasets and sources mean.

## Geographic scope

A metro may include multiple cities, suburbs, counties, planning jurisdictions and statistical units. Its identity and official delineation must cite an appropriate authority and reference period when available. A study rectangle is merely a request/camera envelope. A city's zoning source and a county's assessor source can support part of a metro without covering its entire urbanized area.

The Los Angeles pilot is a starting implementation, not proof of full metropolitan coverage or that every category has end-to-end live verification.

## Required common capabilities

| ID | All metros should support | Los Angeles pilot reference |
| --- | --- | --- |
| `basemaps` | Provider-attributed background maps and geographic context | OSM, OpenTopoMap, USGS, CARTO selection |
| `metro_identity_and_boundaries` | Metro identity, jurisdiction relationships, official boundary provenance | Currently named region presets and approximate study rectangles; official metro delineation remains unfinished |
| `zoning_and_land_use` | Zoning or land-use categories with usable legend and opacity | LA City Planning only, not the whole metro |
| `population_and_demographics` | Tract/local-equivalent population, sex and demographic proportions with source vintage | US Census TIGERweb + Census Reporter ACS |
| `household_income` | Income by documented geography; correct uncertainty and missingness | 2020–2024 ACS estimates; not wealth |
| `parcels_and_cadastre` | Source-backed parcel geometries and administrative IDs | LA County Assessor |
| `land_and_improvement_assessments` | Land/improvement assessed values and roll dates, if available | LA County tax-roll assessments; not market value |
| `retrieval_caching_and_qa` | Viewport-bounded data loading, authorized caching, error recovery and verification | Browser GIS integrations and source registry |

A common display contract does not require identical provider APIs, classification labels, currencies, administrative divisions, or survey instruments. If a data category is unavailable or legally inaccessible, preserve the category in the matrix and explain its status; do not invent a substitute.

Future extensions (elections, true numerical elevation, sales, wealth estimates, transport) are listed in `standard.json` but **not** represented as implemented for Los Angeles or required of other metros today.

## Per-capability evidence

For each metro and capability, record its status, applicable jurisdictions, source IDs, the geographic unit and join key, measurement meaning, periods and limitations, and whether live browser verification exists. Different jurisdictions within the same metro can have independent coverage. A capability is `browser_verified` only if that metro's relevant data flow has actually been tested; unrelated test success does not transfer.

The canonical runtime provider registry is [docs/sources/catalog.json](../sources/catalog.json). Existing source adapters are tracked separately from research candidates. The initial Los Angeles record identifies real work already in Stratlas without declaring the specimen queue processed.

## Work authorization

The specimen queue tracks prospective metropolitan subjects. Adding a metro queues a specimen only. Processing a specimen record may instantiate **task records only** in designated downstream queues, and doing the research/implementation/testing requires a separate explicit instruction. See [queue policy](../queues/README.md), [CONSTITUTION.md](../../CONSTITUTION.md) and [AGENTS.md](../../AGENTS.md).
