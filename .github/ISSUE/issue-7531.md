---
id: 7531
title: Add Database Management Tools to Memory Core Server
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T12:47:47Z'
updatedAt: '2025-10-17T13:25:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7531'
author: tobiu
commentsCount: 0
parentIssue: 7529
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-17T13:25:22Z'
---
# Add Database Management Tools to Memory Core Server

**Reported by:** @tobiu on 2025-10-17

---

**Parent Issue:** #7529 - Epic: Implement Agent-Managed Database Tools

---

To give agents more control over their environment, we will add tools to the Memory Core server to start and stop its underlying ChromaDB instance.

## Acceptance Criteria

1.  A `start_database` tool is added to the `memory-core` server's `openapi.yaml`.
2.  The tool's service handler executes `chroma run --path ./chroma-memory --port 8001` as a background process.
3.  A `stop_database` tool is added, which can terminate the process started by `start_database`.
4.  The `healthcheck` tool is updated to include the running status of the database process.
5.  The new tools are implemented in a new `databaseLifecycleService.mjs`.

