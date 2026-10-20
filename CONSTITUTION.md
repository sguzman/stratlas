# Stratlas Constitution

## Mandate

Stratlas is an independent, public geographic research project. It presents real metropolitan geography and rigorously documented observations through a browser map, while maintaining an ontology of places, geographic features, measurements, datasets, and authoritative sources.

A **metropolitan area** is the top-level research specimen. One specimen can encompass multiple municipalities, counties, statistical geographies, and source jurisdictions. Do not confuse the metropolitan area's definition with an individual city boundary, a county boundary, or a convenient rectangular study window.

Each specimen is intended to support the same common research capabilities as the Los Angeles pilot, subject to the availability and legal reuse of actual source data. Missing or incompatible data must be explicitly disclosed. Never fabricate provider data, coverage, equivalence, or verification.

## Public information and provenance

Only publish project-relevant, professionally worded material that can stand alone. Never publish private conversations, personal grievances, internal commentary about interactions, confidential information, personal circumstances, secrets, credentials, or unreviewed user-provided materials. Public-facing documentation, code comments, tests, commit messages, issues, and generated metadata follow the same rule.

For every integrated dataset, preserve its provider, attribution, API or canonical discovery URL, license/access terms, spatial coverage, geography identifiers, dates or vintages, units, limitations, caching restrictions, and actual integration/verification status. Attribute observed facts to the source that supplied them. Clearly distinguish an observed value from an estimate, a derived measure, a provider classification, and a visualization.

No data or geographic source is represented as downloaded, verified, or complete until that specific claim has been established. Source responses, provider tiles, and bulk geographic datasets do not belong in this repository by default.

## Authority, queues, and work separation

The specimen queue is an intake list, not a work authorization. **Adding a specimen only records it in the specimen queue.** No downstream tasks are created at this step.

**Processing an explicitly authorized specimen-queue item may only instantiate its required tasks in the relevant downstream queues.** It must not research sources, fetch data, write adapters, revise ontology specimens, implement UI, run downstream QA, or process any downstream tasks as part of that operation.

**Downstream queue tasks are executed only upon a separate, explicit user instruction.** A specific instruction to finish all downstream work for a named specimen authorizes that scoped work. General project stewardship, nearby tasks, previous authorization for another specimen, and an existing implementation do not grant blanket permission to process queues.

No autonomous queue draining, automatic specimen promotion, implicit downstream execution, or background processing. Preserve existing work separately from queue state. A task is complete only when its required deliverables and verification are real; unsuccessful, partial, and unavailable work remain distinguishable.

## Specimen consistency

Every metro specimen has the same capability matrix and source/provenance requirements described in [Metropolitan Specimen Standard](docs/metropolises/STANDARD.md). Implementations are source-specific; the public ontology supplies the shared semantics, not invented uniformity. Preserve authentic country-specific geographic systems and measurement definitions.

Stratlas serves as its own independent repo with a complete, locally understandable ontology and source catalog. It does not host or rely on private projects or private resources. **Tarium membership is neither implied nor authorized by this constitution**; any public registry enrollment requires the user's explicit naming and authorization.

## Engineering integrity

Default to the existing `main` branch unless a task explicitly requires another branch. Begin changes from the current branch state, edit only intended files, examine the full diff, and preserve all unrelated files. Abort stale writes if the branch moves. No feature may silently remove a working overlay, map control, cached data behavior, or browser regression check.

Browser-only, viewport/study-bound requests and policy-compliant caching remain the architecture unless a specific task authorizes a change. Validate both unit behavior and real-provider browser integration before claiming that an external map API works. Do not equate an automated passing build with exhaustive coverage.

When source and runtime behavior disagree, report the discrepancy plainly. Keep the root README short; detailed sources, ontology, specimens, and queue metadata belong in dedicated files.

## Changes to governance

Governance edits must be explicit, narrowly scoped, reviewed for public-language hygiene, and committed with ordinary technical messages. Existing instructions are context-specific unless this constitution says otherwise. Do not infer new project-wide restrictions from isolated incidents.
