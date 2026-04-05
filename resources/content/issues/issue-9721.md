---
id: 9721
title: '[Memory Core] GraphRAG Storage Synchronization and Index Stabilization'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-04-05T14:00:25Z'
updatedAt: '2026-04-05T14:03:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9721'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-05T14:03:36Z'
---
# [Memory Core] GraphRAG Storage Synchronization and Index Stabilization

### Description
While investigating Epic #9714 (Hybrid GraphRAG Scoring Algorithm), significant regression bugs were identified within the `memory-core` SQLite testing environments that destabilized neighbor extraction, specifically affecting `GraphService` operations.

This ticket formalizes the fixes developed:
1. **Index Eviction Leakage:** Fixed RAM cache state leakage by cleanly flushing map structures when `Base.collection.Store` execution `clear()` operates across index instances.
2. **Missing `storage` References for Singleton Connections:** Repaired `GraphService.mjs` initialization. Re-used (`Neo.get`) singletons failed to hook onto newly declared `storage` contexts scoped to per-test path variants (leaving them tied down to legacy database bindings).
3. **Implicit Test Crashing Check:** Added explicit imports for `Neo.manager.Instance` missing within our test setups, preventing `Neo.getId()` exceptions during lazy database operations.
4. **Validation cleanup:** Safely eliminated monkey-patched data filtration (`!inRAM`) from `GraphDatabase` as the upstream `neo.collection.Base#splice` efficiently drops bulk inserts implicitly securely evaluating identities mapping checks in `O(1)`.

### Verification Status
The entire `ai/mcp/server/memory-core/services/GraphService.spec.mjs` suite runs correctly executing `npm run test-unit` against a locally bound `test-.db` instance with no duplications.

## Timeline

- 2026-04-05T14:00:26Z @tobiu added the `bug` label
- 2026-04-05T14:00:26Z @tobiu added the `ai` label
- 2026-04-05T14:00:26Z @tobiu added the `core` label
- 2026-04-05T14:00:45Z @tobiu assigned to @tobiu
- 2026-04-05T14:03:20Z @tobiu referenced in commit `475013f` - "fix: Memory Core Graph desynchronization, index leakage, and singleton storage bugs. (#9721)"
### @tobiu - 2026-04-05T14:03:35Z

Completed fixes via 475013f99. Memory Core SQLite testing and Store indices natively stabilized without duplication.

- 2026-04-05T14:03:36Z @tobiu closed this issue

