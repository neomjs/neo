---
id: 9740
title: 'Feature: Vector Apoptosis (True Algorithmic Forgetting) in Memory Core'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-06T18:12:13Z'
updatedAt: '2026-04-06T18:20:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9740'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T18:20:41Z'
---
# Feature: Vector Apoptosis (True Algorithmic Forgetting) in Memory Core

### Description
Currently, the `DreamService.runGarbageCollection()` pipeline successfully decays topological edges (relationships) to maintain structural integrity. However, the exact underlying vector data (the nodes) inside the SQLite engine remains permanently stored even when isolated.

We need to implement "Memory Apoptosis" (cellular cleanup). When a node (such as an old `CONCEPT` or `EPISODE`) decays to the point where it loses all inbound and outbound structural edges (weight 0), the `runGarbageCollection` phase should permanently delete the underlying Vector embedding from the `.neo-ai-data/neo.db`.

### Objective
- Expand `GraphService` or `SQLiteVectorManager` with a hard-delete API (`deleteNode`).
- Enhance `DreamService` garbage collection to query for orphaned nodes post-edge-decay and delete them.
- Ensure orphaned nodes are completely wiped from both structural tables and vector embeddings to keep semantic search extremely fast and hallucination-free.

## Timeline

- 2026-04-06T18:12:14Z @tobiu added the `enhancement` label
- 2026-04-06T18:12:14Z @tobiu added the `ai` label
- 2026-04-06T18:20:14Z @tobiu referenced in commit `80d82c9` - "feat(ai): Implement automated Vector Apoptosis for Graph Garbage Collection (#9740)"
- 2026-04-06T18:20:14Z @tobiu referenced in commit `73df78c` - "docs(ai): Add sandman_handoff.md to the AI Agent boot sequence (#9740)"
### @tobiu - 2026-04-06T18:20:37Z

Vector Apoptosis has been implemented. Orphan nodes are now automatically hard-deleted during the REM Garbage Collection phase. Changes merged to dev.

- 2026-04-06T18:20:39Z @tobiu assigned to @tobiu
- 2026-04-06T18:20:41Z @tobiu closed this issue

