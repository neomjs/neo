---
id: 9647
title: Create GraphService.mjs mapped to ChromaManager
state: CLOSED
labels:
  - ai
  - architecture
  - feature
assignees:
  - tobiu
createdAt: '2026-04-03T10:56:05Z'
updatedAt: '2026-04-03T11:25:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9647'
author: tobiu
commentsCount: 1
parentIssue: 9640
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-03T10:58:56Z'
---
# Create GraphService.mjs mapped to ChromaManager

Parent Epic: #9640

## Problem
The knowledge-base vector records must be synchronized with the graph topology to enable NeoCortex memory traversal.

## Solution
* Build `GraphService.mjs` providing the interface to mutate the graph structure.
* Modify `ChromaManager` (and/or ingestion logic) to simultaneously index vectors and upsert `Node` definitions in the SQLite graph database.

## Timeline

- 2026-04-03T10:56:06Z @tobiu added the `ai` label
- 2026-04-03T10:56:06Z @tobiu added the `architecture` label
- 2026-04-03T10:56:06Z @tobiu added the `feature` label
- 2026-04-03T10:56:20Z @tobiu added parent issue #9640
- 2026-04-03T10:58:34Z @tobiu referenced in commit `c070ace` - "feat: Add better-sqlite3 Graph Storage to knowledge-base (#9646) (#9647)"
### @tobiu - 2026-04-03T10:58:52Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Integrated `GraphService` cross-communication into the `VectorService` ingestion workflow. Valid knowledge chunks dynamically trigger SQLite Node upserts during standard ChromaDB semantic embedding batches.

- 2026-04-03T10:58:57Z @tobiu closed this issue
- 2026-04-03T11:25:12Z @tobiu assigned to @tobiu

