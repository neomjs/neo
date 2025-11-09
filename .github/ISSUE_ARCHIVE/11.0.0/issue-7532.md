---
id: 7532
title: Make start_database Hybrid-Aware
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T13:03:34Z'
updatedAt: '2025-10-17T13:24:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7532'
author: tobiu
commentsCount: 0
parentIssue: 7529
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-17T13:24:15Z'
---
# Make start_database Hybrid-Aware

**Reported by:** @tobiu on 2025-10-17

---

**Parent Issue:** #7529 - Epic: Implement Agent-Managed Database Tools

---

The `start_database` tool is not hybrid-aware. It doesn't check if a ChromaDB instance is already running on the target port before attempting to spawn a new one. This needs to be corrected to support developers who prefer to manage the DB process manually.

## Acceptance Criteria

1.  The `knowledgeBase` object in `ai/mcp/server/config.mjs` is updated with `host` and `port` properties.
2.  The `start_database` function in `knowledge-base/services/databaseLifecycleService.mjs` is updated.
3.  It first performs a heartbeat check on the configured host and port.
4.  If the heartbeat is successful, it returns a status indicating the database is already running and does not spawn a new process.
5.  If the heartbeat fails, it proceeds with spawning a new background process.

