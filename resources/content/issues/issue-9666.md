---
id: 9666
title: 'Epic: Migrate Knowledge Graph to Memory Core'
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-04-03T21:44:03Z'
updatedAt: '2026-04-03T22:17:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9666'
author: tobiu
commentsCount: 1
parentIssue: 9638
subIssues:
  - '[x] 9667 Phase 1: Cleanse knowledge-base of Graph Logic'
  - '[x] 9668 Phase 2: Migrate Graph Service and OpenAPI to memory-core'
  - '[x] 9669 Phase 3: Unleash DreamService Graph Extraction'
subIssuesCompleted: 3
subIssuesTotal: 3
blockedBy: []
blocking: []
closedAt: '2026-04-03T22:17:10Z'
---
# Epic: Migrate Knowledge Graph to Memory Core

### Background
The `knowledge-base` server provides public framework insights (distributed in release ZIPs). The `memory-core` server handles private user history. `DreamService` translates private session histories into Graph Nodes. Keeping the Graph SQLite Database inside `knowledge-base` inherently risks exposing private memory nodes inside public graph zip bundles, and caused process locking when `memory-core` attempted cross-server imports. 

The Graph database natively tracks episodic memories, so it must be owned exclusively by the `memory-core` MCP server.

### Architecture Blueprint
1. **Cleanse `knowledge-base`:**
   - Remove `GraphService.mjs`.
   - Remove `upsertNode` from `VectorService.mjs` (L223-L231).
   - Strip `/graph/*` routes from `openapi.yaml`.
2. **Empower `memory-core`:**
   - Migrate `GraphService.mjs` natively into `/memory-core/services/`.
   - Re-graft `/graph/*` routes into the `memory-core/openapi.yaml` mapping.
   - Configure SQLite to target `chroma-neo-memory-core/graph/knowledge-graph.sqlite`.
3. **Restore `DreamService`:**
   - Let `DreamService.mjs` import `GraphService` safely from its new local directory, avoiding all cross-process IPC locks.

## Timeline

- 2026-04-03T21:44:10Z @tobiu added the `epic` label
- 2026-04-03T21:44:10Z @tobiu added the `ai` label
- 2026-04-03T21:44:10Z @tobiu added parent issue #9638
- 2026-04-03T21:44:19Z @tobiu cross-referenced by #9667
- 2026-04-03T21:44:23Z @tobiu added sub-issue #9667
- 2026-04-03T21:44:30Z @tobiu cross-referenced by #9668
- 2026-04-03T21:44:35Z @tobiu added sub-issue #9668
- 2026-04-03T21:44:41Z @tobiu cross-referenced by #9669
- 2026-04-03T21:44:48Z @tobiu added sub-issue #9669
- 2026-04-03T21:51:49Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-03T22:02:06Z

We have fully migrated the Knowledge Graph from `knowledge-base` to `memory-core` resolving cross-process IPC locks and protecting episodic memory privacy.

- 2026-04-03T22:02:08Z @tobiu closed this issue
- 2026-04-03T22:04:17Z @tobiu reopened this issue
- 2026-04-03T22:17:10Z @tobiu closed this issue

