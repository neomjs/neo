---
id: 7945
title: 'Refactor: MCP Client Lifecycle and CLI Runner Renaming'
state: OPEN
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-30T00:50:25Z'
updatedAt: '2025-11-30T00:50:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7945'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor: MCP Client Lifecycle and CLI Runner Renaming

Refactor the MCP Client architecture to ensure clear separation of concerns, consistent lifecycle management, and appropriate naming.

### Deliverables

1.  **Refactor `Neo.ai.mcp.client.Client` (`ai/mcp/client/Client.mjs`):**
    *   **Lifecycle:** Move connection logic from `connect()` to `initAsync()`. The client should self-connect during initialization. `connect()` should be removed or made private.
    *   **Configuration:** Add `configFile` config. Inside `initAsync`, call `ClientConfig.load(this.configFile)` if provided, before resolving server details.
    *   **Proxies:** Ensure dynamic tool proxies (`this.tools`) are created during `initAsync`.

2.  **Rename and Refactor CLI Runner:**
    *   **Rename:** Move `ai/mcp/client/mcp-stdio.mjs` to `ai/mcp/client/mcp-cli.mjs`.
    *   **Logic:** Update the script to use the new Client lifecycle (`await Neo.create(Client, ...).ready()`).
    *   **Implementation:** Keep the CLI logic (argument parsing, executing `client.listTools()` or `client.tools.x()`, logging results) inside this runner script.
    *   **Cleanup:** Ensure `client.close()` is called before exit.

3.  **Update `package.json`:**
    *   Update `ai:mcp-client` script to point to `ai/mcp/client/mcp-cli.mjs`.

4.  **Refactor `Neo.ai.Agent` (`ai/Agent.mjs`):**
    *   **Remove the `connect()` method.**
    *   **Move client creation, `client.ready()` calls, and tool aggregation logic into `Agent.initAsync()`**.
    *   The `Agent` itself will then be ready when its `initAsync` completes.

5.  **Update `ai/agents/mcp-demo-agent.mjs`:**
    *   Refactor to use `await agent.ready()` instead of `await agent.connect()`.
    *   Verify compatibility.

## Activity Log

- 2025-11-30 @tobiu assigned to @tobiu
- 2025-11-30 @tobiu added the `ai` label
- 2025-11-30 @tobiu added the `refactoring` label

