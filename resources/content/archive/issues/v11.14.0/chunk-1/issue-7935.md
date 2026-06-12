---
id: 7935
title: 'Feat: Implement MCP Client SDK and Demo Agent'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T22:33:17Z'
updatedAt: '2025-11-29T22:35:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7935'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T22:35:28Z'
---
# Feat: Implement MCP Client SDK and Demo Agent

This task implements the core client-side logic for connecting to MCP servers, fulfilling the first phase of Epic #7931.

### Deliverables
1.  **Client SDK:** Implement `Neo.ai.mcp.client.Client`.
    *   Extends `Neo.core.Base`.
    *   Wraps `@modelcontextprotocol/sdk`.
    *   Supports `StdioClientTransport`.
    *   Allows passing environment variables to the spawned process.
2.  **Demo Agent:** Create `ai/agents/mcp-demo-agent.mjs`.
    *   Demonstrate connection to the local `github-workflow` server.
    *   Execute tools via the MCP protocol without direct service imports.

## Timeline

- 2025-11-29T22:33:18Z @tobiu assigned to @tobiu
- 2025-11-29T22:33:19Z @tobiu added the `enhancement` label
- 2025-11-29T22:33:19Z @tobiu added the `ai` label
- 2025-11-29T22:33:33Z @tobiu added parent issue #7931
- 2025-11-29T22:34:19Z @tobiu referenced in commit `455a4e1` - "Feat: Implement MCP Client SDK and Demo Agent #7935"
- 2025-11-29T22:35:28Z @tobiu closed this issue

