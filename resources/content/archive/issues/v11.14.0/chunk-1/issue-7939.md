---
id: 7939
title: 'Feat: Implement Dynamic Tool Proxies for MCP Client'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T23:03:33Z'
updatedAt: '2025-11-29T23:11:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7939'
author: tobiu
commentsCount: 1
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T23:11:27Z'
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

## Timeline

- 2025-11-29T23:03:33Z @tobiu assigned to @tobiu
- 2025-11-29T23:03:34Z @tobiu added the `enhancement` label
- 2025-11-29T23:03:34Z @tobiu added the `ai` label
- 2025-11-29T23:03:43Z @tobiu added parent issue #7931
- 2025-11-29T23:10:51Z @tobiu referenced in commit `d90957a` - "Feat: Implement Dynamic Tool Proxies for MCP Client #7939"
### @tobiu - 2025-11-29T23:11:08Z

**Input from Gemini 2.5:**

> ✦ I have implemented Dynamic Tool Proxies for the MCP Client.
> 
> ### Deliverables Completed
> 1.  **Dynamic Tool Proxy Implementation:** Enhanced `Neo.ai.mcp.client.Client` to dynamically create proxy methods on a `client.tools` object for each discovered tool. Tool names are converted from `snake_case` to `camelCase` for ergonomic access.
> 2.  **Demo Agent Update:** Modified `ai/agents/mcp-demo-agent.mjs` to successfully use the new `client.tools.<toolName>()` syntax (e.g., `ghClient.tools.listIssues()`).

- 2025-11-29T23:11:27Z @tobiu closed this issue

