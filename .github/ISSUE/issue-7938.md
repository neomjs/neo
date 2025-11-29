---
id: 7938
title: 'Refactor: Standardize MCP Client CLI Filename'
state: OPEN
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-29T22:53:00Z'
updatedAt: '2025-11-29T22:53:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7938'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor: Standardize MCP Client CLI Filename

The current file naming for the MCP client CLI (`ai/mcp/client/mcp-cli.mjs`) is inconsistent with the server-side naming convention (`ai/mcp/server/*/mcp-stdio.mjs`).

We should standardize the naming to improve consistency and clarity.

### Deliverables
1.  **Rename CLI Script:** Rename `ai/mcp/client/mcp-cli.mjs` to `ai/mcp/client/mcp-stdio.mjs`.
2.  **Update Package.json:** Update the `ai:mcp-client` script in `package.json` to point to the new file path.

## Activity Log

- 2025-11-29 @tobiu assigned to @tobiu
- 2025-11-29 @tobiu added the `ai` label
- 2025-11-29 @tobiu added the `refactoring` label

