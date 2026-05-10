---
id: 9922
title: '[Epic] Two-Pillar Hybrid RAG: ChromaDB Re-integration & Topological Re-ranking'
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-12T14:09:34Z'
updatedAt: '2026-04-12T16:59:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9922'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 9923 [Sub-Task] Configuration & Lifecycle Re-alignment for Two-Pillar RAG'
  - '[x] 9924 [Sub-Task] Database Service & Health Diagnostics Migration'
  - '[x] 9925 [Sub-Task] Re-Ranker Middleware Construction (Hybrid RAG Pipeline)'
  - '[x] 9929 Stabilize AI Test Suite environment dependencies'
  - '[x] 9931 Refactor DreamService to Finalize Two-Pillar Hybrid RAG'
subIssuesCompleted: 5
subIssuesTotal: 5
blockedBy: []
blocking: []
closedAt: '2026-04-12T16:03:20Z'
---
# [Epic] Two-Pillar Hybrid RAG: ChromaDB Re-integration & Topological Re-ranking

## Architectural Bottleneck
Currently, Swarm Episodic Memory (`memory-core`) utilizes `sqlite-vec` to manage embeddings. Extensive analysis verified that `sqlite-vec` executes brute-force exact nearest neighbor (KNN) via full table scans $O(N)$ and does not construct a $O(\log N)$ Hierarchical Navigable Small World (HNSW) indexing graph. 
Furthermore, attempting to bridge this gap by mathematically layering an explicit HNSW topology inside the V8 engine over standard `ai/graph` SQLite edges fails severely on execution latency and GC constraints when operating on dense 4096-Dimensional embedding geometries.

## The Objective
We must decisively separate the Hybrid RAG components to utilize the exact engines explicitly built for their mathematical constraints:
1. **Pillar A (Semantic Search):** Revert the raw embedding sink to **ChromaDB**. Chroma natively uses `hnswlib` internally via C++/Rust to handle billion-scale MMAP logic and geometric spatial bounds efficiently, resolving the Swarm memory context limits flawlessly.
2. **Pillar B (Topological Proximity):** Retain **SQLite** categorically for explicit, relational Native Edge Graph paths.

## The Strategy
1. **Restore Vector Engine:** Prioritize and restore `ChromaManager.mjs` as the default high-scale embedding driver within the `memory-core` server configuration, phasing out `SQLiteVectorManager.mjs`.
2. **Implement Dual-Phase Re-Ranking Middleware:** Abstract a routing filter inside `StorageRouter.mjs` to execute true hybrid RAG:
    - *Pass 1:* Execute a similarity heuristic against ChromaDB to extract the Top K semantically relevant Node IDs.
    - *Pass 2:* Filter those retrieved IDs explicitly through the SQLite Native Edge Graph to weight them via Topological proximity (e.g., connected actively to `Frontier`, shared sequence topologies).

## Rationale & Avoided Pitfalls
- **Avoided V8 HNSW Implementations:** Building a multi-layer Skip List index inside interpreted JavaScript over SQLite triggers introduces colossal V8 Garbage Collection pauses and fundamentally negates low-level SIMD scaling.
- **Genuine Hybrid Execution:** Previously, `SessionService` isolated SQLite Vector tables from SQLite Graph tables without continuous systemic crossover rendering. This Two-Pillar re-ranker enforces intersection at the absolute base of the architecture.

## Timeline

- 2026-04-12T14:09:35Z @tobiu added the `epic` label
- 2026-04-12T14:09:35Z @tobiu added the `ai` label
- 2026-04-12T14:09:36Z @tobiu added the `architecture` label
- 2026-04-12T14:15:45Z @tobiu cross-referenced by #9923
- 2026-04-12T14:15:50Z @tobiu cross-referenced by #9925
- 2026-04-12T14:15:52Z @tobiu cross-referenced by #9924
- 2026-04-12T14:15:56Z @tobiu added sub-issue #9923
- 2026-04-12T14:15:57Z @tobiu added sub-issue #9924
- 2026-04-12T14:15:58Z @tobiu added sub-issue #9925
- 2026-04-12T14:23:34Z @tobiu cross-referenced by PR #9926
- 2026-04-12T15:36:26Z @tobiu referenced in commit `66569e6` - "feat: Two-Pillar Hybrid RAG Architecture (#9922) (#9926)

* feat(memory-core): Re-align configuration and lifecycles for Two-Pillar RAG (#9923)

* feat(memory-core): Migrate Database service and Health Diagnostics (#9924)

* feat(memory-core): Implement Dual-Pass Re-Ranking Middleware and Extricate SQLiteVectorManager (#9925)"
- 2026-04-12T15:36:26Z @tobiu closed this issue
- 2026-04-12T15:42:51Z @tobiu reopened this issue
- 2026-04-12T15:48:05Z @tobiu referenced in commit `87ae7e5` - "feat(ai): Add native buffer transfer bridge from SQLite to Chroma (#9922)"
- 2026-04-12T15:48:22Z @tobiu cross-referenced by PR #9927
- 2026-04-12T15:59:33Z @tobiu referenced in commit `236e503` - "fix(ai): Finalize ChromaDB migration for Memory Core (#9922)"
- 2026-04-12T15:59:42Z @tobiu cross-referenced by PR #9928
- 2026-04-12T16:03:20Z @tobiu referenced in commit `8add3da` - "fix(ai): Finalize ChromaDB migration for Memory Core (#9922) (#9928)

* fix(ai): Finalize ChromaDB migration for Memory Core (#9922)

* fix(ai): Restore uncommitted services.mjs and SessionSummarization.spec.mjs changes for Chroma migration"
- 2026-04-12T16:03:20Z @tobiu closed this issue
- 2026-04-12T16:23:36Z @tobiu cross-referenced by #9929
- 2026-04-12T16:23:42Z @tobiu added sub-issue #9929
- 2026-04-12T16:24:00Z @tobiu cross-referenced by PR #9930
- 2026-04-12T16:34:35Z @tobiu cross-referenced by #9931
- 2026-04-12T16:34:42Z @tobiu added sub-issue #9931
- 2026-04-12T16:59:20Z @tobiu assigned to @tobiu

