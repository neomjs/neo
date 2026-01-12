---
id: 7872
title: Refactor GitHub Workflow MCP Server to use Neo.core.Base architecture
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T10:39:34Z'
updatedAt: '2025-11-23T10:58:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7872'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T10:58:55Z'
---
# Refactor GitHub Workflow MCP Server to use Neo.core.Base architecture

**Objective:**
Refactor the GitHub Workflow MCP server entry point to align with the Neo.mjs architecture by encapsulating the server logic within a `Neo.core.Base` class.

**Changes:**

1.  **Create `ai/mcp/server/github-workflow/Server.mjs`**:
    *   Define `class Server extends Neo.core.Base`.
    *   **Class Fields:** `configFile`, `mcpServer`, `transport`.
    *   **`initAsync()`**:
        *   Call `super.initAsync()`.
        *   Load custom config via `aiConfig.load()` if `this.configFile` is set.
        *   Initialize `McpServer` instance.
        *   Set up request handlers (`listTools`, `callTool`).
        *   Perform `HealthService.healthcheck()` and log status.
        *   **Specific Logic:** If health check passes, call `RepositoryService.fetchAndCacheViewerPermission()` to cache permissions early.
        *   Initialize and connect `StdioServerTransport`.
    *   **Methods:** Extract helper methods for `setupRequestHandlers` and `logStartupStatus`.

2.  **Refactor `ai/mcp/server/github-workflow/mcp-stdio.mjs`**:
    *   Convert into a lightweight "runner" script.
    *   **Imports:** Ensure correct order: `Neo` -> `core/_export` -> `InstanceManager` -> `aiConfig` -> `logger` -> `Server`.
    *   **Logic:**
        *   Parse CLI arguments (`-d`, `-c`).
        *   Update `aiConfig.data.debug` immediately.
        *   Instantiate `Server` inside a `try/catch` block.
        *   Use top-level `await` to wait for `server.ready()`.
        *   Handle errors cleanly (log and exit).

**Technical Details:**
*   Completes the refactoring of all 3 MCP servers to the Neo.mjs class architecture.


## Timeline

- 2025-11-23T10:43:33Z @tobiu assigned to @tobiu
- 2025-11-23T10:43:41Z @tobiu added the `enhancement` label
- 2025-11-23T10:43:41Z @tobiu added the `ai` label
- 2025-11-23T10:44:02Z @tobiu referenced in commit `580f038` - "Refactor GitHub Workflow MCP Server to use Neo.core.Base architecture #7872"
### @tobiu - 2025-11-23T10:44:23Z

**Input from Gemini:**

> ✦ Refactoring complete. The GitHub Workflow MCP server now uses the standardized `Neo.core.Base` architecture.
> 
> **Implementation Details:**
> 1.  **`Server.mjs`**: Encapsulates the server application logic, including specific GitHub permission caching in `initAsync`.
> 2.  **`mcp-stdio.mjs`**: Converted to the standard runner pattern with robust top-level `await` error handling and correct import ordering.
> 
> This unifies the architecture across all three MCP servers (Memory Core, Knowledge Base, GitHub Workflow), making them easier to maintain and test.

- 2025-11-23T10:58:55Z @tobiu closed this issue

