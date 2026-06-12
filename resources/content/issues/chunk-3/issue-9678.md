---
id: 9678
title: Native Graph Database SQLite Persistence Adapter
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T01:17:58Z'
updatedAt: '2026-04-04T01:34:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9678'
author: tobiu
commentsCount: 1
parentIssue: 9673
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T01:34:06Z'
---
# Native Graph Database SQLite Persistence Adapter

The `Neo.ai.graph.Database` currently achieves ultra-fast O(1) topological traversals via its specialized mapped memory `Store`. However, to prevent total state loss on server reboots, it requires a robust disk persistence strategy. 

Since the `Neo.ai.*` namespace uniquely targets Node.js environments unconditionally (bypassing strict browser isomerism isolation mechanisms), we can integrate standard native Node instances dynamically directly at the backend driver layer.

### Scope
- Construct `Neo.ai.graph.storage.SQLite` utilizing robust `better-sqlite3` schemas.
- Implement storage triggers linking standard `nodes_` and `edges_` Store mutations to instantaneous, atomic SQL transactions. 
- Refactor the existing standalone SQLite mechanism in `memory-core/services/GraphService.mjs` and establish this new Storage configuration universally for the whole `Neo.ai.graph` engine namespace.

## Timeline

- 2026-04-04T01:18:00Z @tobiu added the `enhancement` label
- 2026-04-04T01:18:00Z @tobiu added the `ai` label
- 2026-04-04T01:18:06Z @tobiu added parent issue #9673
- 2026-04-04T01:33:46Z @tobiu referenced in commit `152d111` - "feat: Implement Native Edge SQLite Graph Persistence (#9678)"
- 2026-04-04T01:34:03Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-04T01:34:05Z

Native Edge SQLite Graph Persistence and overarching migration implemented and verified via unit tests. Definition of Done met.

- 2026-04-04T01:34:07Z @tobiu closed this issue

