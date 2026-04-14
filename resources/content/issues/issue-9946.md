---
id: 9946
title: Fix Topology Hallucination Regression in DreamService Hybrid GraphRAG
state: CLOSED
labels:
  - bug
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-13T07:23:53Z'
updatedAt: '2026-04-13T22:33:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9946'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-13T07:24:38Z'
---
# Fix Topology Hallucination Regression in DreamService Hybrid GraphRAG

### Problem
The Native Edge Graph is hallucinating priorities. Specifically, blocked issues (like `#9299` which is blocked by `#9915`) are incorrectly surfacing in the Golden Path despite explicit `BLOCKED_BY` attributes. This represents a critical regression from the intended topological discounting algorithms designed in `#9910`.

**Architectural Root Cause:**
Following the shift to the localized SQLite `neo_graph_nodes` architecture, the Graph layer was migrated to heavily rely on Lazy Vicinity Loading (`loadNodeVicinitySync`) rather than a full upfront RAM boot, to protect Node.js `V8` memory limits. 
However, the logic evaluating edge weights within `DreamService.mjs` directly queries the raw RAM stores (`GraphService.db.edges.items` and `getByIndex()`) *without* first invoking `GraphService.db.getAdjacentNodes()`. 

Since the cache remained completely cold organically, the `BLOCKS` edges inserted into SQLite were NEVER mapped into RAM during `synthesizeGoldenPath()`. This caused `blockers` arrays to evaluate as completely empty, silently bypassing the `isBlocked` circuit-breaker logic.

### Solution
1. Ensure `GraphService.db.getAdjacentNodes(issueId, 'both')` is executed immediately prior to querying `GraphService.db.edges.items` in `ingestIssueStates()` to guarantee the active topological bounds are mapped into `Neo.data.Store`.
2. Similarly, invoke `GraphService.db.getAdjacentNodes(issueId, 'both')` before the `getByIndex` block inside `synthesizeGoldenPath()`.
3. Validating the Golden Path re-calculates `#9299` accurately as structurally rejected.

## Timeline

- 2026-04-13T07:23:53Z @tobiu added the `bug` label
- 2026-04-13T07:23:53Z @tobiu added the `ai` label
- 2026-04-13T07:23:54Z @tobiu added the `architecture` label
- 2026-04-13T07:24:19Z @tobiu referenced in commit `f5f95ab` - "fix: Stabilize DreamService hybrid graph topology cohesion (#9946)"
- 2026-04-13T07:24:28Z @tobiu cross-referenced by PR #9947
- 2026-04-13T07:24:38Z @tobiu referenced in commit `5e98aef` - "fix: Stabilize DreamService hybrid graph topology cohesion (#9946) (#9947)"
- 2026-04-13T07:24:38Z @tobiu closed this issue
- 2026-04-13T22:33:10Z @tobiu assigned to @tobiu

