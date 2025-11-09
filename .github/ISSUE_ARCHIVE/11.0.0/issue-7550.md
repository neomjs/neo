---
id: 7550
title: Convert databaseLifecycleService to DatabaseLifecycleService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-19T21:17:21Z'
updatedAt: '2025-10-19T21:18:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7550'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-19T21:18:16Z'
---
# Convert databaseLifecycleService to DatabaseLifecycleService Neo.mjs Class

**Reported by:** @tobiu on 2025-10-19

---

**Parent Issue:** #7536 - Epic: Integrate Neo.mjs Core into MCP Servers

---

This ticket covers refactoring `ai/mcp/server/knowledge-base/services/databaseLifecycleService.mjs` into a singleton class that extends `Neo.core.Base`. The file was renamed to `DatabaseLifecycleService.mjs` to follow project conventions. This service is responsible for starting, stopping, and checking the status of the ChromaDB process for the knowledge base.

## Acceptance Criteria

1.  The file `ai/mcp/server/knowledge-base/services/databaseLifecycleService.mjs` is renamed to `DatabaseLifecycleService.mjs`.
2.  The content is replaced with a `DatabaseLifecycleService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  Existing functions (`start_database`, `stop_database`, `get_database_status`) are converted into class methods.
4.  A new `ChromaManager.mjs` service is created and used by the `DatabaseLifecycleService` to handle DB connections, mirroring the `memory-core` architecture.
5.  The `ai/mcp/server/knowledge-base/services/toolService.mjs` is updated to import the `DatabaseLifecycleService` class and map its methods.
6.  All related tools (`start_database`, `stop_database`) continue to function correctly after the refactoring.

