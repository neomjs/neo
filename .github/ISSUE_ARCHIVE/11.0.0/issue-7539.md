---
id: 7539
title: Improve isDbRunning() in DatabaseLifecycleService
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-18T11:51:16Z'
updatedAt: '2025-10-18T11:58:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7539'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-18T11:58:34Z'
---
# Improve isDbRunning() in DatabaseLifecycleService

**Reported by:** @tobiu on 2025-10-18

---

**Parent Issue:** #7536 - Epic: Integrate Neo.mjs Core into MCP Servers

---

The `isDbRunning()` method within `AI.mcp.server.memory.DatabaseLifecycleService` was previously creating a new `ChromaClient` instance for every check, leading to unnecessary overhead. This ticket documents the improvement to leverage the already instantiated `ChromaManager` singleton's client for performing the `heartbeat()` check.

This approach aligns with the goal of integrating Neo.mjs core into the MCP servers by utilizing existing singletons and their managed resources, while also being more efficient.

## Acceptance Criteria

1.  The `isDbRunning()` method in `AI.mcp.server.memory.DatabaseLifecycleService` imports the `ChromaManager` singleton.
2.  The `isDbRunning()` method uses `ChromaManager.client.heartbeat()` within a `try...catch` block to check for a running ChromaDB instance.
3.  The method correctly returns `true` if `heartbeat()` succeeds and `false` if it fails (e.g., due to `ChromaManager.client` being null or the database not being reachable).

