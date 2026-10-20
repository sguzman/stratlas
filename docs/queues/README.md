# Metropolitan specimen and work queues

Stratlas uses metropolitan-area research specimens. The queues are explicit data structures, not an automatic background scheduler or implicit permission to act.

## Intake and dispatch

**Queueing** a new metro means adding an entry to [specimens.json](specimens.json) and a specimen descriptor in [docs/metropolises/](../metropolises/). This does not instantiate tasks or begin source research. A metadata-only record may contain known prior implementation facts, without performing new specimen work.

**Processing a specimen queue item**, only when explicitly requested, instantiates task records in the downstream queues named by the [dispatch blueprint](dispatch-blueprint.json). Task creation is the *only* permitted result of specimen queue processing. A task record must identify the specimen ID, queue, capability IDs, prerequisites, deliverable, and `queued` status. Task creation must be idempotent: repeated dispatch must not create duplicate IDs. Dispatch then updates the specimen queue item's processing state and records which tasks were instantiated.

**Processing a downstream queue** requires separate, explicit authorization naming a queue or the full downstream work for a particular metro. It may then research, create ontology entries, implement source adapters/UI, and verify results, depending on that queue's mandate. Progress updates and completion are written only for authorized tasks, and their evidence must be genuine. A general instruction to maintain Stratlas does not authorize emptying these queues.

The user's instruction to finish all downstream work for a specific metro is sufficient to authorize that metro's downstream tasks. It does not authorize processing another metro, altering unrelated queues, or silently enqueuing other metropolitan specimens.

## Queue inventory

| Queue | Purpose | Intake allowed without explicit processing? |
| --- | --- | --- |
| `specimens` | Record the metropolitan areas requested for future processing | Only on explicit metro enqueue instruction |
| `boundary-and-identity` | Official metro scope and relevant geographic identity systems | No, only specimen dispatch creates tasks |
| `source-discovery` | Provider/API discovery, policies, coverage and vintages | No |
| `ontology-and-measurements` | Geographic relationships, joins, units and measurements | No |
| `data-integration` | Bounded browser requests, adapters, caching | No |
| `map-presentation` | Visible map controls, legends and inspection semantics | No |
| `verification-and-provenance` | Source validation, automated tests and documentation audit | No |

See the [human-readable queue status](STATUS.md) and [tasks.json](tasks.json) for currently instantiated downstream tasks. The initial task queues are deliberately empty; their [blueprint](dispatch-blueprint.json) is not an active backlog.

## Los Angeles intake

Los Angeles is the first and only queued metro, with a [specimen record](../metropolises/los-angeles.json) documenting the already operational LA pilot. Prior implementation and successful browser tests do **not** mean the specimen queue item has been processed. No task in any downstream queue has been created by this intake. LA City/County study rectangles do not assert an official metropolitan extent.

## Data integrity

Use one specimen identifier per metropolitan subject. Do not assume a metro equals its namesake central city or county. Preserve existing provider/source catalog IDs, classifications, date/vintage, terms, legitimate regional coverage and QA state. The common [capability standard](../metropolises/STANDARD.md) applies to every metro, with explicit statuses for incomplete and unavailable categories.

Only professional, project-relevant and verifiable public text belongs in these files. Consult [CONSTITUTION.md](../../CONSTITUTION.md) and [AGENTS.md](../../AGENTS.md) for broader safeguards.
