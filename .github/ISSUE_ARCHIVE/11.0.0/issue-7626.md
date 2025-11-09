---
id: 7626
title: Cache Viewer Permission on Server Startup
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-23T15:06:25Z'
updatedAt: '2025-10-23T15:19:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7626'
author: tobiu
commentsCount: 0
parentIssue: 7604
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-23T15:19:06Z'
---
# Cache Viewer Permission on Server Startup

**Reported by:** @tobiu on 2025-10-23

---

**Parent Issue:** #7604 - Epic: Automate MCP Server Startup and Reduce Agent Protocol

---

As part of the epic to automate MCP server startup and reduce agent protocol (#7604), we should proactively fetch and cache the user's permission level for the repository when the `github-workflow` server starts. Currently, an agent would need to explicitly call the `get_viewer_permission` tool, which is an unnecessary extra step.

By fetching this information on startup, we simplify the agent's workflow and make the permission data readily available to all internal services.

### Proposed Solution

1.  **Add a Cache Field:** In `ai/mcp/server/github-workflow/services/RepositoryService.mjs`, add a new class field to the singleton, such as `viewerPermission = null;`, to hold the permission string.

2.  **Fetch on Startup:** In `ai/mcp/server/github-workflow/mcp-stdio.mjs`, modify the `main()` startup function. After the initial health check, call the `RepositoryService.getViewerPermission()` method once and store its result in the new `viewerPermission` field on the `RepositoryService` singleton.

3.  **Refactor `getViewerPermission` Tool:** Modify the `getViewerPermission` method in `RepositoryService` to be a simple, synchronous getter. Instead of making a GraphQL call, it should just return the value cached in the `viewerPermission` field. The actual GraphQL call will be moved to a new private method (e.g., `#fetchViewerPermission`) used only during startup.

### Acceptance Criteria

-   When the `github-workflow` server starts, it makes one call to determine the viewer's permission level.
-   The permission level is stored on the `RepositoryService` singleton.
-   The `get_viewer_permission` tool reads from the cached value and does not make a new API call.
-   Other services can import `RepositoryService` and access the permission level directly (e.g., `RepositoryService.viewerPermission`).

