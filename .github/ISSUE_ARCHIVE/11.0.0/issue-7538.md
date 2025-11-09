---
id: 7538
title: Convert DatabaseLifecycleService to a Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-18T11:28:07Z'
updatedAt: '2025-10-18T11:38:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7538'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-18T11:38:27Z'
---
# Convert DatabaseLifecycleService to a Neo.mjs Class

**Reported by:** @tobiu on 2025-10-18

---

**Parent Issue:** #7536 - Epic: Integrate Neo.mjs Core into MCP Servers

---

This ticket covers refactoring `ai/mcp/server/memory-core/services/databaseLifecycleService.mjs` into a singleton class that extends `Neo.core.Base`. This service is responsible for managing the lifecycle of the ChromaDB process (starting, stopping, and checking its status).

## Acceptance Criteria

1.  The `databaseLifecycleService.mjs` module is refactored into a `DatabaseLifecycleService` class.
2.  The `DatabaseLifecycleService` class extends `Neo.core.Base` and is configured as a singleton.
3.  State variables (e.g., `chromaProcess`) are moved into the Neo config system (e.g., `chromaProcess_`).
4.  Existing functions (`isDbRunning`, `start_database`, `stop_database`, `get_database_status`) are converted into class methods.
5.  The `ai/mcp/server/memory-core/services/toolService.mjs` is updated to import the `DatabaseLifecycleService` singleton.
6.  Any services that depend on `databaseLifecycleService` are updated to use the new singleton instance.
7.  The `neo-memory-core__healthcheck` tool and other related tools continue to function correctly after the refactoring.

