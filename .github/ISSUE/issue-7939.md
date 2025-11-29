---
id: 7939
title: 'Feat: Implement Dynamic Tool Proxies for MCP Client'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T23:03:33Z'
updatedAt: '2025-11-29T23:03:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7939'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Implement Dynamic Tool Proxies for MCP Client

This task aims to enhance the MCP Client by implementing Dynamic Tool Proxies. After connecting to an MCP server, the client will expose the server''s tools as directly callable methods under a `client.tools` namespace. This improves ergonomics, discovery, and enables future argument validation.

### Deliverables
1.  **Dynamic Tool Proxy Implementation:** Enhance `Neo.ai.mcp.client.Client` to:
    *   Fetch the list of tools from the connected MCP server (using `listTools()`).
    *   Dynamically create proxy methods on a `client.tools` object for each discovered tool.
    *   Each proxy method will automatically call `client.callTool()` with the correct tool name and passed arguments.
2.  **Demo Agent Update:** Modify `ai/agents/mcp-demo-agent.mjs` to demonstrate using the new `client.tools.<toolName>()` syntax.
3.  **Argument Validation (Optional/Future):** (Consider for later) Integrate OpenAPI schemas from `listTools()` to perform client-side argument validation before making the `callTool` request.

## Activity Log

- 2025-11-29 @tobiu assigned to @tobiu
- 2025-11-29 @tobiu added the `enhancement` label
- 2025-11-29 @tobiu added the `ai` label

