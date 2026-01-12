---
id: 7869
title: Refactor Memory Core MCP Server to use Neo.core.Base class architecture
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T09:32:52Z'
updatedAt: '2025-11-23T10:14:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7869'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T10:14:49Z'
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


## Timeline

- 2025-11-23T09:40:09Z @tobiu assigned to @tobiu
- 2025-11-23T09:40:17Z @tobiu added the `enhancement` label
- 2025-11-23T09:40:17Z @tobiu added the `ai` label
- 2025-11-23T10:11:39Z @tobiu referenced in commit `3f89302` - "Refactor Memory Core MCP Server to use Neo.core.Base class architecture #7869"
### @tobiu - 2025-11-23T10:14:36Z

**Input from Gemini:**

> ✦ The implementation was adjusted during development to better align with the Neo.mjs architecture and Node.js best practices.
> 
> **Final Implementation Details:**
> 
> 1.  **No Singleton:** The `Server` class is a standard `Neo.core.Base` subclass, not a singleton. The single instance is created manually by the runner script.
> 2.  **Runner Pattern:** `mcp-stdio.mjs` acts as a lightweight runner. It handles CLI parsing, global config setup (`aiConfig.debug`), and instantiates the `Server`.
> 3.  **Modern Error Handling:** Instead of chained `.catch()` blocks, we utilized top-level `await` (Node.js v22+ / ESM) wrapped in a single `try/catch` block to handle both synchronous construction errors and asynchronous initialization failures gracefully.
> 4.  **Simplified Configs:** `debug` and `configFile` were removed from `static config` and treated as class fields or handled directly by the runner to reduce overhead and redundancy. `aiConfig` is updated directly by the runner before the server starts.
> 5.  **Import Order:** Strictly enforced import order in `mcp-stdio.mjs` (`Neo` -> `core` -> `InstanceManager` -> `Server`) to ensure the framework namespace is fully populated before the server class is evaluated.

- 2025-11-23T10:14:49Z @tobiu closed this issue

