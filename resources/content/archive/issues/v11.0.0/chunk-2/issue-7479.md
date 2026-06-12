---
id: 7479
title: Scaffold GitHub Workflow MCP Server
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-14T08:58:31Z'
updatedAt: '2025-10-14T08:59:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7479'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-14T08:59:36Z'
---
# Scaffold GitHub Workflow MCP Server

This ticket covers the initial scaffolding of the GitHub Workflow MCP server. This involves creating the basic directory structure and placeholder files required to begin development, mirroring the architecture of the existing Memory Core MCP server.

A meaningful health check has been implemented to verify that the `gh` CLI is installed and authenticated, which is critical for the server's operation.

## Acceptance Criteria

1.  The following directory structure has been created:
    - `ai/mcp/server/github-workflow/`
    - `ai/mcp/server/github-workflow/middleware/`
    - `ai/mcp/server/github-workflow/routes/`
    - `ai/mcp/server/github-workflow/services/`
2.  Core server files have been created:
    - `index.mjs` (entry point)
    - `app.mjs` (Express app setup)
    - `config.mjs` (server configuration)
3.  Middleware handlers have been created:
    - `asyncHandler.mjs`
    - `errorHandler.mjs`
    - `notFoundHandler.mjs`
4.  The `/healthcheck` endpoint is functional:
    - `routes/health.mjs` is created.
    - `services/healthService.mjs` is created and uses `gh auth status` to check for CLI installation and authentication.
5.  Placeholder files for the pull request workflow are in place:
    - `routes/pullRequests.mjs`

## Timeline

- 2025-10-14T08:58:31Z @tobiu assigned to @tobiu
- 2025-10-14T08:58:32Z @tobiu added the `enhancement` label
- 2025-10-14T08:58:32Z @tobiu added parent issue #7477
- 2025-10-14T08:58:32Z @tobiu added the `ai` label
- 2025-10-14T08:59:20Z @tobiu referenced in commit `25ea946` - "Scaffold GitHub Workflow MCP Server #7479"
- 2025-10-14T08:59:37Z @tobiu closed this issue

