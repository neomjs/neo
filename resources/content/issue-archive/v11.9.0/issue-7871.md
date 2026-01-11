---
id: 7871
title: Refactor Knowledge Base MCP Server to use Neo.core.Base architecture
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T10:33:07Z'
updatedAt: '2025-11-23T10:38:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7871'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T10:38:35Z'
---
# Refactor Knowledge Base MCP Server to use Neo.core.Base architecture

**Objective:**
Refactor the Knowledge Base MCP server entry point to align with the Neo.mjs architecture by encapsulating the server logic within a `Neo.core.Base` class. This applies the same proven pattern used for the Memory Core server.

**Changes:**

1.  **Create `ai/mcp/server/knowledge-base/Server.mjs`**:
    *   Define `class Server extends Neo.core.Base`.
    *   **Class Fields:** `configFile`, `mcpServer`, `transport`.
    *   **`initAsync()`**:
        *   Call `super.initAsync()`.
        *   Load custom config via `aiConfig.load()` if `this.configFile` is set.
        *   Initialize `McpServer` instance.
        *   Set up request handlers (`listTools`, `callTool`).
        *   Await `DatabaseService.ready()`.
        *   Perform `HealthService.healthcheck()` and log status.
        *   Initialize and connect `StdioServerTransport`.
    *   **Methods:** Extract helper methods for `setupRequestHandlers` and `logStartupStatus`.

2.  **Refactor `ai/mcp/server/knowledge-base/mcp-stdio.mjs`**:
    *   Convert into a lightweight "runner" script.
    *   **Imports:** Ensure correct order: `Neo` -> `core/_export` -> `InstanceManager` -> `aiConfig` -> `logger` -> `Server`.
    *   **Logic:**
        *   Parse CLI arguments (`-d`, `-c`).
        *   Update `aiConfig.data.debug` immediately.
        *   Instantiate `Server` inside a `try/catch` block.
        *   Use top-level `await` to wait for `server.ready()`.
        *   Handle errors cleanly (log and exit).

**Technical Details:**
*   Replicates the robust architecture from the Memory Core refactoring.
*   Ensures consistent lifecycle management and error handling.


## Timeline

- 2025-11-23T10:33:23Z @tobiu assigned to @tobiu
- 2025-11-23T10:33:33Z @tobiu added the `enhancement` label
- 2025-11-23T10:33:33Z @tobiu added the `ai` label
- 2025-11-23T10:38:16Z @tobiu referenced in commit `6e346a9` - "Refactor Knowledge Base MCP Server to use Neo.core.Base architecture #7871"
- 2025-11-23T10:38:35Z @tobiu closed this issue
### @tobiu - 2025-11-23T10:38:44Z

**Input from Gemini:**

> ✦ The Knowledge Base MCP server has been successfully refactored to use the `Neo.core.Base` architecture.
> 
> **Implementation Highlights:**
> 1.  **`Server.mjs`**: New class that manages the server lifecycle (`initAsync`), service dependencies (`DatabaseService`), and MCP transport. It uses class fields for `configFile`, `mcpServer`, and `transport`.
> 2.  **`mcp-stdio.mjs`**: Refactored into a lightweight runner that parses CLI args, sets up global debug config, and launches the `Server` instance with robust error handling (top-level `await` inside `try/catch`).
> 3.  **Consistency**: Logic mirrors the proven pattern used in the Memory Core refactoring, ensuring a unified architecture across MCP services.


