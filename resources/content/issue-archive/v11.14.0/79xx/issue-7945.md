---
id: 7945
title: 'Refactor: MCP Client Lifecycle and CLI Runner Renaming'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-30T00:50:25Z'
updatedAt: '2025-11-30T01:13:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7945'
author: tobiu
commentsCount: 1
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-30T01:13:06Z'
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

## Timeline

- 2025-11-30T00:50:25Z @tobiu assigned to @tobiu
- 2025-11-30T00:50:26Z @tobiu added the `ai` label
- 2025-11-30T00:50:26Z @tobiu added the `refactoring` label
- 2025-11-30T00:50:51Z @tobiu added parent issue #7931
- 2025-11-30T01:12:02Z @tobiu referenced in commit `c541ee2` - "Refactor: MCP Client Lifecycle and CLI Runner Renaming #7945"
### @tobiu - 2025-11-30T01:12:43Z

**Input from Gemini 2.5:**

> ✦ I have completed the refactoring to align the MCP Client Lifecycle and rename the CLI runner.
> 
> ### Deliverables Completed
> 1.  **Refactor `Neo.ai.mcp.client.Client` (`ai/mcp/client/Client.mjs`):**
>     *   Moved connection logic from the `connect()` method into `initAsync()`.
>     *   Removed the `connect()` method entirely.
>     *   Added `configFile` config and integrated config loading into `initAsync()`.
>     *   The client now correctly self-connects and ensures readiness when `await client.ready()` is called.
> 2.  **Rename and Refactor CLI Runner:**
>     *   Renamed `ai/mcp/client/mcp-stdio.mjs` to `ai/mcp/client/mcp-cli.mjs`.
>     *   Updated the runner script to use the new Client lifecycle (`await Neo.create(Client, ...).ready()`).
>     *   The runner now correctly executes CLI actions and closes the client.
> 3.  **Update `package.json`:**
>     *   Modified the `ai:mcp-client` NPM script to point to `ai/mcp/client/mcp-cli.mjs`.
> 4.  **Refactor `Neo.ai.Agent` (`ai/Agent.mjs`):**
>     *   Removed the `connect()` method.
>     *   Moved client creation, `client.ready()` calls, and tool aggregation logic into `Agent.initAsync()`.
>     *   Ensured `this.clients` is correctly populated.
> 5.  **Update `ai/agents/mcp-demo-agent.mjs`:**
>     *   Refactored to use `await agent.ready()` instead of `await agent.connect()`.
>     *   Verified all client and agent interactions.
> 
> This refactoring ensures architectural consistency across the client and server components and aligns the lifecycle management with `Neo.core.Base` principles.

- 2025-11-30T01:13:06Z @tobiu closed this issue

