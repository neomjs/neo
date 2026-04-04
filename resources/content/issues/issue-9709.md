---
id: 9709
title: '[Vector Bridge] Stitching Chroma Semantics to SQLite Edge Nodes'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-04T21:05:25Z'
updatedAt: '2026-04-04T21:05:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9709'
author: tobiu
commentsCount: 0
parentIssue: 9673
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

