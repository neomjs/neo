---
id: 7481
title: Implement Pull Request API Endpoints
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-14T09:21:59Z'
updatedAt: '2025-10-14T09:22:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7481'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-14T09:22:53Z'
---
# Implement Pull Request API Endpoints

**Reported by:** @tobiu on 2025-10-14

---

**Parent Issue:** #7477 - Architect GitHub Workflow as MCP Server

---

This ticket covers the implementation of the core pull request-related endpoints for the GitHub Workflow MCP server. This provides the foundational functionality for the AI agent to begin interacting with pull requests.

The following endpoints have been implemented:

- `GET /pull-requests`
- `POST /pull-requests/:pr_number/checkout`
- `GET /pull-requests/:pr_number/diff`

## Acceptance Criteria

1.  A new `pullRequestService.mjs` is created in the `services` directory.
2.  The service contains functions that wrap the corresponding `gh` CLI commands:
    - `listPullRequests` uses `gh pr list`
    - `checkoutPullRequest` uses `gh pr checkout`
    - `getPullRequestDiff` uses `gh pr diff`
3.  The `routes/pullRequests.mjs` file is updated to call these new service functions.
4.  The endpoints correctly handle requests and return the expected JSON data or plain text diff.

