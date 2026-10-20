# Queue status — metropolitan specimens

This page is the human-readable companion to [specimens.json](specimens.json), [tasks.json](tasks.json), and [dispatch-blueprint.json](dispatch-blueprint.json). **Reading or updating a status page never executes queue work.** Machine-readable queue records are authoritative.

## Specimen intake

| Specimen | Specimen ID | Status | Specimen processing | Downstream dispatch |
| --- | --- | --- | --- | --- |
| [Los Angeles metropolitan area](../metropolises/los-angeles.md) | `metro:us:ca:los-angeles` | `queued` | `not_authorized` | `not_created` |

**1 queued specimen; 0 instantiated downstream tasks.** Los Angeles has an existing functioning pilot, but its queue entry has **not been processed**. The intake item did not generate any implementation or research work.

## Downstream queues

| Queue | Tasks currently instantiated | What this queue would do if explicitly authorized |
| --- | ---: | --- |
| `boundary-and-identity` | 0 | Metro definition, official source for boundaries and constituent jurisdictions, dated geographic identifiers, supported study bounds. |
| `source-discovery` | 0 | Find official permissible API endpoints, policy/attribution, coverage, vintages, access and ID systems for each capability. |
| `ontology-and-measurements` | 0 | Source-to-place and source-to-dataset mappings, measure meanings, join rules, identifiers, units, dates, and unavailable-data notes. |
| `data-integration` | 0 | Browser-source adapters constrained by study area, source policy, cache permission, pagination and safe rate limits. |
| `map-presentation` | 0 | Map controls, layer legends, opacity/highlights, missingness and temporal labels for required available capabilities. |
| `verification-and-provenance` | 0 | Unit/browser QA, real-provider verification, public-text audit, source permissions and documentation of partial coverage. |

The downstream queues are empty. These descriptions are **task blueprints**, not assigned jobs, not progress updates, and not authorization to process a metropolis.

## Distinct operations

**Enqueue specimen:** Record only a unique metropolitan-area intake item and its non-executing descriptor. Do not discover sources or instantiate any downstream tasks.

**Process a specimen queue item:** When separately authorized, create only the relevant downstream task records for that specimen. No research, adapters, visualizations, source requests, or QA are executed during dispatch.

**Process downstream work:** Requires another explicit instruction identifying the queue or a named metro's full downstream scope. Only then do tasks perform source research, ontology, application integration, and verification.

Any operation must update the authoritative machine-readable records and then the corresponding Markdown pages. No periodic scheduler or repository maintenance request may silently drain queues.

Read the [full queue policy](README.md), [metropolitan standard](../metropolises/STANDARD.md), [LA profile](../metropolises/los-angeles.md), and [constitution](../../CONSTITUTION.md).
