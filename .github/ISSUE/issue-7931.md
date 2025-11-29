---
id: 7931
title: 'Epic: MCP Client Implementation for Agents'
state: OPEN
labels:
  - epic
  - ai
assignees: []
createdAt: '2025-11-29T17:32:36Z'
updatedAt: '2025-11-29T17:32:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7931'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Epic: MCP Client Implementation for Agents

# Epic: MCP Client Implementation for Agents

## Context
Currently, our agents (like `pm.mjs`) use the "Code Execution" pattern by importing service classes directly from `ai/services.mjs`. This is efficient but tightly coupled to the repo structure.

To achieve true decoupling and enable agents to use *any* MCP server (not just ours, and not just local ones), we need to implement a standard **MCP Client** within our SDK.

## Strategic Value
1.  **Standardization:** Agents communicate via the standard MCP protocol (Stdio/SSE), making them agnostic to the server's implementation.
2.  **Extensibility:** Agents can connect to 3rd-party MCP servers (e.g., a PostgreSQL MCP, a Google Drive MCP) just by spawning them.
3.  **Recursion:** Agents can spawn new Agents, and those Agents can connect to the same (or different) MCP servers.

## Key Deliverables
1.  **Client SDK:** Implement `Neo.ai.mcp.Client` using `@modelcontextprotocol/sdk`.
    *   Support `StdioClientTransport`.
    *   Support dynamic tool discovery (`list_tools`).
2.  **Agent Integration:** Update `Neo.ai.Agent` (future class) to accept a list of MCP Server configs, connecting to them on startup.
3.  **Demo:** An agent that uses the `github-workflow` server via MCP protocol instead of direct import.

## Tech Stack
*   `@modelcontextprotocol/sdk`


## Activity Log

- 2025-11-29 @tobiu added the `epic` label
- 2025-11-29 @tobiu added the `ai` label

