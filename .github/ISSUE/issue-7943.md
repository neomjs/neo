---
id: 7943
title: 'Refactor: Extract MCP Client CLI Logic into Dedicated Controller Class'
state: OPEN
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-30T00:20:49Z'
updatedAt: '2025-11-30T00:20:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7943'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor: Extract MCP Client CLI Logic into Dedicated Controller Class

The current `ai/mcp/client/mcp-stdio.mjs` script is overloaded with logic (CLI parsing, tool execution, output formatting) that violates the "thin runner" pattern established by the server implementation.

To fix this and maintain architectural consistency:
1.  **Create `Neo.ai.mcp.client.Cli`:** A new class in `ai/mcp/client/Cli.mjs` responsible for handling the CLI interaction flow. It will:
    *   Accept parsed options (server, listTools, callTool, args).
    *   Instantiate and manage the `Neo.ai.mcp.client.Client`.
    *   Execute the requested operation.
    *   Handle output formatting and logging.
2.  **Refactor `ai/mcp/client/mcp-stdio.mjs`:** Reduce this file to a minimal runner that simply parses command-line arguments using `commander` and instantiates `Neo.ai.mcp.client.Cli` to do the work.

This separation ensures `Client.mjs` remains a clean transport wrapper for use by Agents, while the CLI logic is encapsulated in its own class, and the runner remains purely a bootstrapper.

### Deliverables
*   `ai/mcp/client/Cli.mjs`
*   Refactored `ai/mcp/client/mcp-stdio.mjs`

## Activity Log

- 2025-11-30 @tobiu assigned to @tobiu
- 2025-11-30 @tobiu added the `ai` label
- 2025-11-30 @tobiu added the `refactoring` label

