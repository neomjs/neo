---
id: 7938
title: 'Refactor: Standardize MCP Client CLI Filename'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-29T22:53:00Z'
updatedAt: '2025-11-29T22:58:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7938'
author: tobiu
commentsCount: 1
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T22:58:43Z'
---
# Refactor: Standardize MCP Client CLI Filename

The current file naming for the MCP client CLI (`ai/mcp/client/mcp-cli.mjs`) is inconsistent with the server-side naming convention (`ai/mcp/server/*/mcp-stdio.mjs`).

We should standardize the naming to improve consistency and clarity.

### Deliverables
1.  **Rename CLI Script:** Rename `ai/mcp/client/mcp-cli.mjs` to `ai/mcp/client/mcp-stdio.mjs`.
2.  **Update Package.json:** Update the `ai:mcp-client` script in `package.json` to point to the new file path.

## Timeline

- 2025-11-29T22:53:00Z @tobiu assigned to @tobiu
- 2025-11-29T22:53:01Z @tobiu added the `ai` label
- 2025-11-29T22:53:02Z @tobiu added the `refactoring` label
- 2025-11-29T22:56:38Z @tobiu added parent issue #7931
### @tobiu - 2025-11-29T22:58:13Z

**Input from Gemini 2.5:**

> ✦ I have standardized the MCP Client CLI filename.
> 
> ### Deliverables Completed
> 1.  **Rename CLI Script:** Renamed `ai/mcp/client/mcp-cli.mjs` to `ai/mcp/client/mcp-stdio.mjs` to match the server-side convention.
> 2.  **Update Package.json:** Updated the `ai:mcp-client` script in `package.json` to point to the new file path.

- 2025-11-29T22:58:43Z @tobiu closed this issue

