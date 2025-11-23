---
id: 7869
title: Refactor Memory Core MCP Server to use Neo.core.Base class architecture
state: OPEN
labels: []
assignees: []
createdAt: '2025-11-23T09:32:52Z'
updatedAt: '2025-11-23T09:32:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7869'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor Memory Core MCP Server to use Neo.core.Base class architecture

**Objective:**
Refactor the Memory Core MCP server entry point to use a dedicated `Neo.core.Base` class for the server logic, replacing the procedural script approach. This unifies the architecture and leverages Neo.mjs lifecycle management (`construct`, `initAsync`, `ready`).

**Changes:**

1.  **Create `ai/mcp/server/memory-core/Server.mjs`**:
    *   Define `class Server extends Neo.core.Base`.
    *   **Do NOT** make it a singleton. It should be a standard class.
    *   **Config:** Accept `debug` (Boolean) and `configFile` (String).
    *   **`construct(config)`**:
        *   Call `super.construct(config)`.
        *   Immediately sync `aiConfig.data.debug` if `this.debug` is true.
    *   **`initAsync()`**:
        *   Call `super.initAsync()`.
        *   Load custom config via `aiConfig.load()` if `this.configFile` is set.
        *   Initialize `McpServer` instance.
        *   Set up request handlers using `listTools` and `callTool` from `services/toolService.mjs`.
        *   Await `SessionService.ready()`.
        *   Perform `HealthService.healthcheck()` and log status.
        *   Initialize and connect `StdioServerTransport`.
    *   **Methods:** Extract helper methods for `setupRequestHandlers` and `logStartupStatus` for cleaner code.

2.  **Refactor `ai/mcp/server/memory-core/mcp-stdio.mjs`**:
    *   Convert into a lightweight "runner" script.
    *   Use `commander` to parse CLI arguments (`-d`, `-c`).
    *   Instantiate the server: `const server = Neo.create(Server, { ...options });`
    *   **Error Handling:** Attach a catch handler to the ready promise:
        ```javascript
        server.ready().catch(error => {
            logger.error('Fatal startup error:', error);
            process.exit(1);
        });
        ```

**Technical Details:**
*   Ensures `debug` flag from CLI is respected immediately in the server constructor.
*   Uses `server.ready()` to bridge the gap between synchronous instantiation and asynchronous initialization errors.


