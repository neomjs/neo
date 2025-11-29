---
id: 7936
title: 'Feat: Implement MCP Client Configuration'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T22:44:54Z'
updatedAt: '2025-11-29T22:44:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7936'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Implement MCP Client Configuration

This task implements the client-side configuration system for MCP servers, allowing agents to define and load server connection details from a centralized configuration file.

### Deliverables
1.  **Client Configuration File:** Create `ai/mcp/client/config.mjs` following the `Neo.core.Base` singleton pattern. This file defines a `mcpServers` map for various MCP server endpoints.
2.  **Client Integration:** Update `Neo.ai.mcp.client.Client` to utilize the `ClientConfig` singleton.
    *   Adds a `serverName_` config to specify the target server.
    *   Loads `command` and `args` from the `ClientConfig.mcpServers` map.
3.  **Demo Agent Update:** Modify `ai/agents/mcp-demo-agent.mjs` to demonstrate loading server configurations via `serverName_` instead of hardcoding connection details.

## Activity Log

- 2025-11-29 @tobiu assigned to @tobiu
- 2025-11-29 @tobiu added the `enhancement` label
- 2025-11-29 @tobiu added the `ai` label

