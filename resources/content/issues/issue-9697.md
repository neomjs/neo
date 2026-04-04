---
id: 9697
title: 'Fix: GraphService direct lookups fail on Lazy Loading cache misses'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T16:13:03Z'
updatedAt: '2026-04-04T16:13:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9697'
author: tobiu
commentsCount: 1
parentIssue: 9673
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T16:13:41Z'
---
# Fix: GraphService direct lookups fail on Lazy Loading cache misses

### Problem
After the implementation of Distributed Caching & Lazy Loading for the Native Edge Graph Database, the Graph DB no longer synchronously loads all nodes into the in-memory cache upon initialization. 
However, methods inside `memory-core/services/GraphService.mjs` such as `getContextFrontier`, `getNode`, and `getNeighbors` were still synchronously querying the empty local memory store via `this.db.nodes.get(id)`. This resulted in `null` responses (e.g., "No context frontier configured") because the methods failed to trigger a lazy load from SQLite first.

### Solution
Explicitly enforce lazy loading ahead of direct memory queries.
- Inject `this.db.getAdjacentNodes([id], 'both')` securely preceding the memory queries inside `GraphService.mjs`. This guarantees that if a node is actively a cache miss, the engine drops down to SQLite to retrieve it and its vicinity.

### Epic Link
This is a sub-issue of Epic #9673 (Hybrid GraphRAG).

## Timeline

- 2026-04-04T16:13:04Z @tobiu added the `bug` label
- 2026-04-04T16:13:04Z @tobiu added the `ai` label
- 2026-04-04T16:13:15Z @tobiu added parent issue #9673
- 2026-04-04T16:13:29Z @tobiu referenced in commit `ecbb80a` - "fix(memory-core): Enforce SQLite lazy loading on direct node queries (#9697)"
- 2026-04-04T16:13:38Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-04T16:13:40Z

Fix committed and pushed. Explicit lazy loading added to GraphService.

- 2026-04-04T16:13:42Z @tobiu closed this issue
- 2026-04-04T16:44:44Z @tobiu cross-referenced by #9699

