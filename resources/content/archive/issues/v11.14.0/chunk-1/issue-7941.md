---
id: 7941
title: Investigate Multi-Server Tool Namespacing for MCP Client
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-29T23:29:54Z'
updatedAt: '2025-11-29T23:45:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7941'
author: tobiu
commentsCount: 2
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T23:45:11Z'
---
# Investigate Multi-Server Tool Namespacing for MCP Client

This task involves integrating multiple MCP servers into the MCP Client and exploring the behavior of tool listing, specifically regarding name collisions (e.g., `healthcheck`).

The goal is to determine how the `Neo.ai.mcp.client.Client` should expose tools from multiple servers. The proposed strategy is to namespace tools by server (e.g., `this.tools.githubWorkflow.healthcheck`) to avoid conflicts and provide a structured API.

### Deliverables
1.  **Multi-Server Experiment:** Create a temporary script `ai/mcp/client/test-multi-server.mjs` that connects to all three servers (`github-workflow`, `knowledge-base`, `memory-core`) using separate `Client` instances or a modified `Client` that can handle multiple connections (depending on findings).
2.  **Analyze Tool Discovery:** Observe the output of `listTools()` when multiple servers are involved. Check if tool names collide or if the SDK provides server metadata.
3.  **Implement Namespacing (Proposal):** Based on findings, refactor `Neo.ai.mcp.client.Client` or create a higher-level `Neo.ai.Agent` class that aggregates tools into `this.tools.<serverName>.<toolName>`.
4.  **Update Client Config:** Ensure `ai/mcp/client/config.mjs` supports the multi-server setup.

## Timeline

- 2025-11-29T23:29:54Z @tobiu assigned to @tobiu
- 2025-11-29T23:29:55Z @tobiu added the `enhancement` label
- 2025-11-29T23:29:56Z @tobiu added the `ai` label
- 2025-11-29T23:29:56Z @tobiu added the `refactoring` label
- 2025-11-29T23:30:02Z @tobiu added parent issue #7931
### @tobiu - 2025-11-29T23:31:24Z

**Input from Gemini 2.5:**

> ✦ I have conducted the **Multi-Server Experiment**.
> 
> ### Findings
> *   **Collision Confirmed:** All three servers (`github-workflow`, `knowledge-base`, `memory-core`) expose a `healthcheck` tool.
> *   **Partial Collision:** `knowledge-base` and `memory-core` both expose `start_database` and `stop_database` tools.
> *   **Current Behavior:** The `Neo.ai.mcp.client.Client` creates dynamic proxies on `this.tools`. If we were to merge these into a single object (e.g., in an Agent class), these collisions would be problematic.
> 
> ### Proposed Solution: Server Namespacing
> As suggested in the ticket, we should namespace tools by server.
> 
> **Implementation Plan:**
> 1.  Modify `Neo.ai.mcp.client.Client` to **not** flatten tools onto `this.tools` directly, OR...
> 2.  Actually, the `Client` represents a *single* connection. The namespacing should happen at the **Agent** level (or a new `ClientManager` class).
> 3.  Since `Neo.ai.Agent` is not yet implemented, I propose refactoring `Client` to support an optional `namespace` config. If provided, tools are mounted at `client.tools[namespace]`. If not, they remain at `client.tools` (backward compatibility).
> 
> **Correction:**
> Wait, `Neo.ai.mcp.client.Client` connects to **one** server.
> So `client.tools` *is* effectively namespaced by the client instance itself.
> 
> In `test-multi-server.mjs`:
> ```javascript
> const ghClient = ...;
> const kbClient = ...;
> 
> ghClient.tools.healthcheck(); // GitHub health
> kbClient.tools.healthcheck(); // KB health
> ```
> 
> The collision only happens if we try to merge them.
> 
> **Refined Proposal:**
> We don't need to change `Client.mjs` to namespace tools *internally*.
> Instead, the future `Neo.ai.Agent` should likely hold a map of clients:
> ```javascript
> class Agent {
>     clients = {
>         github: new Client({ serverName: 'github-workflow' }),
>         memory: new Client({ serverName: 'memory-core' })
>     }
>     
>     async work() {
>         await this.clients.github.tools.listIssues();
>         await this.clients.memory.tools.addMemory();
>     }
> }
> ```
> 
> This seems cleaner than `this.tools.githubWorkflow.healthcheck`.
> 
> **However**, for the "Agent OS" vision, we often want a unified toolbox.
> If we *do* want a unified toolbox, we can implement a `ToolAggregator` that handles collisions by prefixing.
> 
> **Decision:**
> I will verify if `config.mjs` needs updates. It currently supports the map.
> I will conclude the investigation with the recommendation: **Keep Client simple. Handle aggregation in Agent/Manager.**
> 
> For this ticket, I will clean up the test script and close it, as the "investigation" is complete and the "namespacing" is best handled by the consumer (Agent) rather than forcing it into the low-level Client.
> 
> Wait, the ticket says: *"Implement Namespacing (Proposal): ... refactor Client or create Agent ... aggregates tools"*.
> 
> I will write a simple `Neo.ai.Agent` MVP class now to demonstrate this aggregation pattern, as it is the natural next step and fulfills the "Implement" part of the ticket via the "higher-level class" option.

- 2025-11-29T23:44:30Z @tobiu referenced in commit `82d9904` - "Feat: Implement Multi-Server Tool Namespacing for MCP Client #7941"
### @tobiu - 2025-11-29T23:44:37Z

**Input from Gemini 2.5:**

> ✦ I have completed the investigation and implementation for multi-server tool namespacing.
> 
> ### Deliverables Completed
> 1.  **Multi-Server Experiment & Analysis:** Confirmed tool name collisions and determined that namespacing is necessary.
> 2.  **Implemented Namespacing:** Created the `Neo.ai.Agent` base class (`ai/Agent.mjs`) which:
>     *   Manages multiple `Neo.ai.mcp.client.Client` instances.
>     *   Aggregates tools into a structured `this.tools.<serverName>.<toolName>` namespace, converting server names to camelCase for ergonomic access.
> 3.  **Updated Demo Agent:** Refactored `ai/agents/mcp-demo-agent.mjs` to instantiate and use `Neo.ai.Agent`, demonstrating connections to multiple servers and usage of the namespaced tools.
> 4.  **Clean-up:** Deleted the temporary `ai/mcp/client/test-multi-server.mjs` script.
> 
> This establishes a clear and scalable architecture for agents to interact with multiple MCP servers. (Note: The observed `memory-core` output schema validation error is a bug in the `memory-core` server itself, unrelated to this client namespacing work).

- 2025-11-29T23:45:12Z @tobiu closed this issue

