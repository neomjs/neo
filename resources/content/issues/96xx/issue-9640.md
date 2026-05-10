---
id: 9640
title: Knowledge Graph Database Backend (Neocortex)
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-03T10:44:43Z'
updatedAt: '2026-04-03T11:02:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9640'
author: tobiu
commentsCount: 0
parentIssue: 9638
subIssues:
  - '[x] 9646 Add better-sqlite3 Graph Storage to knowledge-base'
  - '[x] 9647 Create GraphService.mjs mapped to ChromaManager'
subIssuesCompleted: 2
subIssuesTotal: 2
blockedBy: []
blocking: []
closedAt: '2026-04-03T11:02:06Z'
---
# Knowledge Graph Database Backend (Neocortex)

Parent Epic: #9638

## Problem
The `knowledge-base` server currently relies purely on ChromaDB. This prevents relational structure querying (AST topologies + episodic associations).

## Solution
Introduce a local relational Graph backend using standard local SQLite tables (`Nodes` and `Edges`).
*   Create `GraphService.mjs` inside `neo/ai/mcp/server/knowledge-base/services/`.
*   Establish Semantic ID linking with Vector database hashes.

## Timeline

- 2026-04-03T10:44:45Z @tobiu added the `ai` label
- 2026-04-03T10:44:45Z @tobiu added the `architecture` label
- 2026-04-03T10:44:46Z @tobiu added the `feature` label
- 2026-04-03T10:44:58Z @tobiu added parent issue #9638
- 2026-04-03T10:46:33Z @tobiu removed the `feature` label
- 2026-04-03T10:46:34Z @tobiu added the `epic` label
- 2026-04-03T10:56:05Z @tobiu cross-referenced by #9646
- 2026-04-03T10:56:06Z @tobiu cross-referenced by #9647
- 2026-04-03T10:56:18Z @tobiu added sub-issue #9646
- 2026-04-03T10:56:20Z @tobiu added sub-issue #9647
- 2026-04-03T11:00:53Z @tobiu assigned to @tobiu
- 2026-04-03T11:02:06Z @tobiu closed this issue

