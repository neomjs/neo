---
id: 7937
title: 'Feat: Implement MCP Client CLI and NPM Script'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T22:48:47Z'
updatedAt: '2025-11-29T22:52:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7937'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T22:52:53Z'
---
# Feat: Implement MCP Client CLI and NPM Script

This task implements a command-line interface (CLI) for the MCP Client and integrates it into the project''s NPM scripts. This will allow for easy testing and interaction with MCP servers directly from the command line.

### Deliverables
1.  **MCP Client CLI Script:** Create `ai/mcp/client/mcp-cli.mjs`.
    *   Uses `commander` to parse CLI arguments for server selection, tool listing, and tool invocation.
    *   Bootstraps the `Neo.mjs` framework.
    *   Instantiates `Neo.ai.mcp.client.Client` to interact with specified MCP servers.
2.  **NPM Script Integration:** Add a new script `ai:mcp-client` to `package.json` that executes `node ai/mcp/client/mcp-cli.mjs`.

## Timeline

- 2025-11-29T22:48:47Z @tobiu assigned to @tobiu
- 2025-11-29T22:48:48Z @tobiu added the `enhancement` label
- 2025-11-29T22:48:48Z @tobiu added the `ai` label
- 2025-11-29T22:48:54Z @tobiu added parent issue #7931
- 2025-11-29T22:52:43Z @tobiu referenced in commit `b8d5fea` - "Feat: Implement MCP Client CLI and NPM Script #7937"
- 2025-11-29T22:52:53Z @tobiu closed this issue

