# Concept-Neighborhood Read Probe

Issue: #14474 · Epic: #14472 · Generated: 2026-07-02T21:21:34.875Z · maxHops: 2

Read-only raw-edge probe. Privacy contract: MEMORY/SESSION/MESSAGE/SUMMARY neighbors render
aggregate-only (count + axis tallies), never ids, never content. Every row carries its own
read timestamp — live edges churn (#14422 OQ4); unstamped rows are unciteable.

## Reachability matrix

| Concept | Cluster size | Member | Edges | Edge types | Zero-explanation | Zero-memory-attach | Truncated |
|---|---:|---|---:|---|---|---|---|
| delta-updates | 2 | CLASS:DeltaUpdates | 12 | IMPLEMENTS:10, RESOLVES:2 | YES | YES | no |
| delta-updates | 2 | CONCEPT:DeltaUpdates | 0 | - | YES | YES | no |
| delta-updates | 2 | delta-updates | 5 | IMPLEMENTED_BY:5 | YES | YES | no |
| golden-path | 5 | CLASS:GoldenPath | 0 | - | YES | YES | no |
| golden-path | 5 | CONCEPT:Golden Path | 0 | - | YES | YES | no |
| golden-path | 5 | CONCEPT:Golden-Path | 0 | - | YES | YES | no |
| golden-path | 5 | CONCEPT:GoldenPath | 70 | IMPLEMENTS:6, EXTENDS:5, DEPENDS_ON:2, VALIDATES:53, DISCUSSED_IN:1, MENTIONED_IN:1, TESTS:1, RESOLVES:1 | YES | YES | no |
| golden-path | 5 | CONCEPT:Golden_Path | 80 | DISCUSSED_IN:6, RELATES_TO:4, RESOLVES:4, IMPLEMENTS:6, MENTIONED_IN:3, DEPENDS_ON:2, EXTENDS:1, VALIDATES:53, TESTS:1 | YES | no | no |
| golden-path | 5 | golden-path | 51 | TAGGED_CONCEPT:30, PARENT_CONCEPT:2, SENT_BY:4, SENT_TO:4, DELIVERED_TO:9, EXPLAINED_BY:1, IMPLEMENTED_BY:1 | no | no | no |
| dream-pipeline | 5 | CLASS:Dream Pipeline | 0 | - | YES | YES | no |
| dream-pipeline | 5 | CLASS:Dream-Pipeline | 0 | - | YES | YES | no |
| dream-pipeline | 5 | CLASS:DreamPipeline | 3 | IMPLEMENTS:2, DISCUSSED_IN:1 | YES | no | no |
| dream-pipeline | 5 | CONCEPT:Dream Pipeline | 0 | - | YES | YES | no |
| dream-pipeline | 5 | CONCEPT:DreamPipeline | 6 | IMPLEMENTS:4, RESOLVES:1, EXTENDS:1 | YES | YES | no |
| dream-pipeline | 5 | dream-pipeline | 28 | PARENT_CONCEPT:2, EXPLAINED_BY:2, IMPLEMENTED_BY:2, TAGGED_CONCEPT:19, DELIVERED_TO:3 | no | no | no |
| ADR:0026 | 1 | ADR:0026 | 5 | IMPLEMENTS:2, MENTIONED_IN:2, RESOLVES:1 | YES | no | no |
| AGENT:Antigravity_Primary | 1 | AGENT:Antigravity_Primary | 3 | IMPLEMENTS:2, RELATES_TO:1 | YES | YES | no |
| AGENT:NEO_GPT | 3 | AGENT:NEO_GPT | 0 | - | YES | YES | no |
| AGENT:NEO_GPT | 3 | AGENT:Neo-GPT | 5 | MENTIONED_IN:3, REFERENCED_BY:1, DISCUSSED_IN:1 | YES | no | no |
| AGENT:NEO_GPT | 3 | AGENT:Neo_GPT | 20 | IMPLEMENTS:3, RESOLVES:3, DISCUSSED_IN:5, REFERRED_BY:1, MENTIONED_IN:6, CAUSES_ISSUE:2 | YES | no | no |
| AGENT:NEO_OPUS | 2 | AGENT:NEO_OPUS | 3 | IMPLEMENTS:3 | YES | YES | no |
| AGENT:NEO_OPUS | 2 | AGENT:Neo-Opus | 5 | MENTIONED_IN:3, REFERENCED_BY:1, DISCUSSED_IN:1 | YES | no | no |

## Four-axis presence (storage-level, per member)

| Member | authority | fidelity | extractionProvenance | lifecycle | Interpretation |
|---|---:|---:|---:|---:|---|
| CLASS:DeltaUpdates | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| CONCEPT:DeltaUpdates | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| delta-updates | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| CLASS:GoldenPath | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| CONCEPT:Golden Path | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| CONCEPT:Golden-Path | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| CONCEPT:GoldenPath | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| CONCEPT:Golden_Path | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| golden-path | 47 | 0 | 0 | 0 | partially materialized |
| CLASS:Dream Pipeline | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| CLASS:Dream-Pipeline | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| CLASS:DreamPipeline | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| CONCEPT:Dream Pipeline | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| CONCEPT:DreamPipeline | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| dream-pipeline | 22 | 0 | 0 | 0 | partially materialized |
| ADR:0026 | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| AGENT:Antigravity_Primary | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| AGENT:NEO_GPT | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| AGENT:Neo-GPT | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| AGENT:Neo_GPT | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| AGENT:NEO_OPUS | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |
| AGENT:Neo-Opus | 0 | 0 | 0 | 0 | absent-in-storage (not merely projection) |

## Fragmentation (alias clusters in-sample)

| Cluster key | Members | Neighborhoods disjoint? |
|---|---|---|
| delta-updates | 2 | CLASS:DeltaUpdates→12e · CONCEPT:DeltaUpdates→0e · delta-updates→5e |
| golden-path | 5 | CLASS:GoldenPath→0e · CONCEPT:Golden Path→0e · CONCEPT:Golden-Path→0e · CONCEPT:GoldenPath→70e · CONCEPT:Golden_Path→80e · golden-path→51e |
| dream-pipeline | 5 | CLASS:Dream Pipeline→0e · CLASS:Dream-Pipeline→0e · CLASS:DreamPipeline→3e · CONCEPT:Dream Pipeline→0e · CONCEPT:DreamPipeline→6e · dream-pipeline→28e |
| agent:neo-gpt | 3 | AGENT:NEO_GPT→0e · AGENT:Neo-GPT→5e · AGENT:Neo_GPT→20e |
| agent:neo-opus | 2 | AGENT:NEO_OPUS→3e · AGENT:Neo-Opus→5e |

## OQ5 decision inputs (data only — the epic decides)

- Members probed: 22
- Zero-explanation members: 20/22
- Zero-memory-attachment members: 14/22
- Four-axis property hits across all raw edges: 69
- Projection note: `getNeighbors` exposes ONLY `weight` from edge properties — every axis field above is invisible through the MCP projection by construction.

