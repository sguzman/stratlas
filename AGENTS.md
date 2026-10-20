# AGENTS.md — Stratlas repository guidance

Read [CONSTITUTION.md](CONSTITUTION.md) first. This file explains how contributors and automated agents operate within Stratlas's public repository.

## Scope

- Stratlas is the map presentation layer and an independent public geographic ontology/source registry.
- Metropolitan areas are research specimens. The current specimen intake lives at [docs/queues/specimens.json](docs/queues/specimens.json); metro capability requirements live in [docs/metropolises/STANDARD.md](docs/metropolises/STANDARD.md).
- The existing Los Angeles runtime is an implemented pilot. Existing code is **not evidence** that its specimen queue item has been processed.
- Do not enroll this repository in Tarium or reference private Taria projects unless the user explicitly authorizes the public registry action.

## Operational permissions

1. **Register specimen:** When asked to enqueue a metro, add one unique specimen entry with its name and scope. Do not create downstream tasks, discover sources, or begin implementation.
2. **Process specimen queue:** Only when explicitly instructed, create the specimen's required task records in [docs/queues/tasks.json](docs/queues/tasks.json) with deterministic identifiers, dependencies, and target capability identifiers. Do not execute any task in the same operation. Record the specimen dispatch as completed only after its downstream task records are committed.
3. **Process downstream queue:** Only when explicitly instructed, execute tasks in the named queue or the explicitly authorized end-to-end scope for the named specimen. Record evidence, status, source links, blockers, and required QA; do not silently promote blocked or unverified work.
4. **Non-queue maintenance:** Directly requested repository hygiene and documentation changes can be performed within their stated scope. Such a task never implicitly authorizes queue operations.

Use the known queue names: `boundary-and-identity`, `source-discovery`, `ontology-and-measurements`, `data-integration`, `map-presentation`, `verification-and-provenance`. Add new queue types only through an explicit governance change. Never silently add metro specimens or process another metro as a consequence of finishing the current one.

## Sources and modeling

- Every specimen targets the same categories, including basemaps, metro geography, zoning/land use, demographics/income, parcels and assessed values, and source-backed visualization. See the capability IDs in `docs/metropolises/standard.json`.
- Classify sources as connected, browser-verified, QA-pending, or research-only based on evidence. Source discovery does not imply data retrieval. Metro completeness is a capability-by-capability assessment, not a single optimistic flag.
- Maintain source IDs and provider-scoped feature IDs; never join unrelated OBJECTIDs, substitute a county for a metropolis, assert exact legal boundaries from camera rectangles, or conflate assessed value with market sale price.
- Keep human-readable Markdown companions for public machine-readable metropolitan specimens, ontology inventories, source listings, and queue status. JSON remains authoritative; consistency tests detect ID/status drift. Markdown documentation updates do not authorize queue processing.
- Respect licensing, attribution, access requirements, throttling, terms of use, and provider cache headers. No invented datasets, uncontrolled scraping, entire-country mirrors, secrets, or unnecessary sensitive attributes.
- A source's exact jurisdiction and vintage may make a metro capability partial or unavailable. Document that rather than fabricating comparable measurements.

## Repository hygiene and safeguards

Before a change: inspect current `main`, the affected current files and existing tests. Keep the changed-file set minimal. Use the current HEAD tree as the base for each commit; compare the resulting tree against that parent and preserve unrelated blobs. Reject unexpected deletions or branch movement.

Run schema/queue/ontology tests and relevant Rust/browser checks. Do not suppress a failing CI job just to deploy. Describe what was actually verified and what remains pending.

**Public-facing review:** Scrutinize new source, documentation, test fixtures, generated data, issue content, and commit messages for private conversation fragments, personal narratives, unprofessional insults, personal secrets, and inappropriate or speculative provenance. Rewrite in neutral project language before publication. Do not paste private communications even as negative examples.

Queue files contain brief, neutral task records and references to source/ontology/capability IDs. Keep personal conversation history out of these files. Never substitute agent activity logs for research evidence.
