---
id: 8007
title: Implement Dynamic Loading for NeuralLink
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-03T09:56:17Z'
updatedAt: '2025-12-03T13:47:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8007'
author: tobiu
commentsCount: 1
parentIssue: 7960
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-03T13:47:03Z'
---
# Implement Dynamic Loading for NeuralLink

**Goal:** Implement the Node.js-based MCP Server for Neural Link.

**Requirements:**
1.  **Entry Point:** Create `ai/mcp/server/neural-link/mcp-stdio.mjs` using `commander` for CLI args.
2.  **Server Class:** Implement `ai/mcp/server/neural-link/Server.mjs` extending `Neo.core.Base`.
3.  **Connection Service:** Implement `ai/mcp/server/neural-link/services/ConnectionService.mjs` for WebSocket logic (Singleton, secure `crypto.randomUUID`, private fields).
4.  **Tool Service:** Implement `ai/mcp/server/neural-link/services/toolService.mjs` using the `serviceMapping` pattern.
5.  **Configuration:** Implement `config.mjs` and `logger.mjs` aligned with `memory-core` standards.
6.  **Dependencies:** `ws`, `@modelcontextprotocol/sdk`, `commander`.

## Timeline

- 2025-12-03T09:56:18Z @tobiu added the `enhancement` label
- 2025-12-03T09:56:18Z @tobiu added the `ai` label
- 2025-12-03T09:56:19Z @tobiu added the `refactoring` label
### @tobiu - 2025-12-03T10:16:48Z

**Input from Antigravity:**

> ◆ **CORRECTION: Naming Refinement**
> 
> 1.  **Config**: The flag will be **`Neo.config.useAiClient`**.
> 2.  **Import**: It will dynamically import **`../../ai/Client.mjs`**.
> 

- 2025-12-03T13:42:43Z @tobiu assigned to @tobiu
- 2025-12-03T13:43:13Z @tobiu added parent issue #7960
- 2025-12-03T13:46:48Z @tobiu referenced in commit `4358d77` - "Implement Dynamic Loading for NeuralLink #8007"
- 2025-12-03T13:47:03Z @tobiu closed this issue
- 2025-12-03T13:47:42Z @tobiu cross-referenced by #8010

