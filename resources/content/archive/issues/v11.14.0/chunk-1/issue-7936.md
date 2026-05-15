---
id: 7936
title: 'Feat: Implement MCP Client Configuration'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T22:44:54Z'
updatedAt: '2025-11-29T22:46:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7936'
author: tobiu
commentsCount: 1
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T22:46:23Z'
---
# Feat: Implement MCP Client Configuration

This task implements the client-side configuration system for MCP servers, allowing agents to define and load server connection details from a centralized configuration file.

### Deliverables
1.  **Client Configuration File:** Create `ai/mcp/client/config.mjs` following the `Neo.core.Base` singleton pattern. This file defines a `mcpServers` map for various MCP server endpoints.
2.  **Client Integration:** Update `Neo.ai.mcp.client.Client` to utilize the `ClientConfig` singleton.
    *   Adds a `serverName_` config to specify the target server.
    *   Loads `command` and `args` from the `ClientConfig.mcpServers` map.
3.  **Demo Agent Update:** Modify `ai/agents/mcp-demo-agent.mjs` to demonstrate loading server configurations via `serverName_` instead of hardcoding connection details.

## Timeline

- 2025-11-29T22:44:54Z @tobiu assigned to @tobiu
- 2025-11-29T22:44:55Z @tobiu added the `enhancement` label
- 2025-11-29T22:44:55Z @tobiu added the `ai` label
- 2025-11-29T22:45:05Z @tobiu added parent issue #7931
- 2025-11-29T22:46:00Z @tobiu referenced in commit `769c819` - "Feat: Implement MCP Client Configuration #7936"
### @tobiu - 2025-11-29T22:46:05Z

**Input from Gemini 2.5:**

> ✦ I have implemented the MCP Client Configuration:
> 
> ### Deliverables Completed
> 1.  **Client Configuration File:** Created `ai/mcp/client/config.mjs` following the `Neo.core.Base` singleton pattern, defining `mcpServers` for various MCP server endpoints.
> 2.  **Client Integration:** Updated `Neo.ai.mcp.client.Client` to utilize the `ClientConfig` singleton. It now uses a `serverName_` config to load command and arguments from the `ClientConfig.mcpServers` map.
> 3.  **Demo Agent Update:** Modified `ai/agents/mcp-demo-agent.mjs` to demonstrate loading server configurations via `serverName_` instead of hardcoding connection details.

- 2025-11-29T22:46:23Z @tobiu closed this issue

