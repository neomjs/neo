---
id: 7941
title: Investigate Multi-Server Tool Namespacing for MCP Client
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-29T23:29:54Z'
updatedAt: '2025-11-29T23:29:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7941'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Investigate Multi-Server Tool Namespacing for MCP Client

This task involves integrating multiple MCP servers into the MCP Client and exploring the behavior of tool listing, specifically regarding name collisions (e.g., `healthcheck`).

The goal is to determine how the `Neo.ai.mcp.client.Client` should expose tools from multiple servers. The proposed strategy is to namespace tools by server (e.g., `this.tools.githubWorkflow.healthcheck`) to avoid conflicts and provide a structured API.

### Deliverables
1.  **Multi-Server Experiment:** Create a temporary script `ai/mcp/client/test-multi-server.mjs` that connects to all three servers (`github-workflow`, `knowledge-base`, `memory-core`) using separate `Client` instances or a modified `Client` that can handle multiple connections (depending on findings).
2.  **Analyze Tool Discovery:** Observe the output of `listTools()` when multiple servers are involved. Check if tool names collide or if the SDK provides server metadata.
3.  **Implement Namespacing (Proposal):** Based on findings, refactor `Neo.ai.mcp.client.Client` or create a higher-level `Neo.ai.Agent` class that aggregates tools into `this.tools.<serverName>.<toolName>`.
4.  **Update Client Config:** Ensure `ai/mcp/client/config.mjs` supports the multi-server setup.

## Activity Log

- 2025-11-29 @tobiu assigned to @tobiu
- 2025-11-29 @tobiu added the `enhancement` label
- 2025-11-29 @tobiu added the `ai` label
- 2025-11-29 @tobiu added the `refactoring` label

