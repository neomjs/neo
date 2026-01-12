---
id: 7931
title: 'Epic: MCP Client Implementation for Agents'
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T17:32:36Z'
updatedAt: '2025-12-01T17:14:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7931'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 7935 Feat: Implement MCP Client SDK and Demo Agent'
  - '[x] 7936 Feat: Implement MCP Client Configuration'
  - '[x] 7937 Feat: Implement MCP Client CLI and NPM Script'
  - '[x] 7938 Refactor: Standardize MCP Client CLI Filename'
  - '[x] 7939 Feat: Implement Dynamic Tool Proxies for MCP Client'
  - '[x] 7940 Feat: Add Neo.snakeToCamel utility function'
  - '[x] 7941 Investigate Multi-Server Tool Namespacing for MCP Client'
  - '[x] 7942 Feat: Enable External Configuration and Generic Runner for MCP Client CLI'
  - '[x] 7945 Refactor: MCP Client Lifecycle and CLI Runner Renaming'
  - '[x] 7946 Feat: Implement Client-Side Tool Validation in MCP Client'
  - '[x] 7949 Refactor Shared Tool Validation Service for MCP Client and Server'
  - '[x] 7950 Refactor ToolService to Class-based Architecture'
  - '[x] 7951 Enhance MCP Client with Connection State and Env Validation'
  - '[x] 7952 Fix ToolService.mjs Git Case Sensitivity Issue'
  - '[x] 7953 Refactor Client Configuration Consistency'
subIssuesCompleted: 15
subIssuesTotal: 15
blockedBy: []
blocking: []
closedAt: '2025-12-01T17:14:13Z'
---
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


## Timeline

- 2025-11-29T17:32:37Z @tobiu added the `epic` label
- 2025-11-29T17:32:37Z @tobiu added the `ai` label
- 2025-11-29T17:32:53Z @tobiu assigned to @tobiu
- 2025-11-29T22:33:19Z @tobiu cross-referenced by #7935
- 2025-11-29T22:33:33Z @tobiu added sub-issue #7935
- 2025-11-29T22:45:05Z @tobiu added sub-issue #7936
- 2025-11-29T22:48:54Z @tobiu added sub-issue #7937
- 2025-11-29T22:56:38Z @tobiu added sub-issue #7938
- 2025-11-29T22:57:59Z @tobiu referenced in commit `fe69334` - "Epic: MCP Client Implementation for Agents #7931"
- 2025-11-29T23:03:43Z @tobiu added sub-issue #7939
- 2025-11-29T23:19:12Z @tobiu added sub-issue #7940
- 2025-11-29T23:30:02Z @tobiu added sub-issue #7941
- 2025-11-29T23:57:29Z @tobiu added sub-issue #7942
- 2025-11-30T00:50:51Z @tobiu added sub-issue #7945
- 2025-11-30T11:00:51Z @tobiu added sub-issue #7946
- 2025-11-30T12:24:18Z @tobiu cross-referenced by #7947
- 2025-11-30T13:51:49Z @tobiu added sub-issue #7949
- 2025-11-30T14:38:29Z @tobiu added sub-issue #7950
- 2025-11-30T15:22:26Z @tobiu added sub-issue #7951
- 2025-11-30T15:44:41Z @tobiu added sub-issue #7952
- 2025-11-30T15:58:10Z @tobiu added sub-issue #7953
- 2025-12-01T17:14:13Z @tobiu closed this issue

