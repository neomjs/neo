---
id: 9709
title: '[Vector Bridge] Stitching Chroma Semantics to SQLite Edge Nodes'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-04T21:05:25Z'
updatedAt: '2026-04-04T21:30:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9709'
author: tobiu
commentsCount: 1
parentIssue: 9673
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T21:30:40Z'
---
# [Vector Bridge] Stitching Chroma Semantics to SQLite Edge Nodes

### Description
Dismantle the silos between the Vector database (ChromaDB) and the structural Edge Database (SQLite). Enable unified GraphRAG traversals native to the `memory-core` MCP.

### Acceptance Criteria
- Expand `GraphService.mjs` node schema to link `semanticVectorId`.
- Develop the `query_hybrid_graph` MCP tool to fetch cross-boundary memory + structural payloads in a single turn.
- Related to Epic #9673.

## Timeline

- 2026-04-04T21:05:26Z @tobiu added the `enhancement` label
- 2026-04-04T21:05:26Z @tobiu added the `ai` label
- 2026-04-04T21:05:26Z @tobiu added the `architecture` label
- 2026-04-04T21:05:43Z @tobiu added parent issue #9673
- 2026-04-04T21:30:26Z @tobiu referenced in commit `7ff3068` - "feat: Stitch Chroma Semantics to SQLite Edge Nodes via query_hybrid_graph (#9709)"
- 2026-04-04T21:30:37Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-04T21:30:39Z

Implemented queryNodeTopology in GraphService and the query_hybrid_graph MCP tool in memory-core. Changes pushed.

- 2026-04-04T21:30:40Z @tobiu closed this issue
- 2026-04-05T00:44:18Z @tobiu cross-referenced by #9714

