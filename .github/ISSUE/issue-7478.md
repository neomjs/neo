---
id: 7478
title: Define Initial OpenAPI Specification for GitHub Workflow Server
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-14T08:40:11Z'
updatedAt: '2025-10-14T08:56:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7478'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-14T08:56:51Z'
---
# Define Initial OpenAPI Specification for GitHub Workflow Server

**Reported by:** @tobiu on 2025-10-14

---

**Parent Issue:** #7477 - Architect GitHub Workflow as MCP Server

---

This ticket covers the creation of the initial `openapi.yaml` specification for the new GitHub Workflow MCP server.

The goal is to define a clear, structured API for the server's first iteration, focusing on the core functionalities needed to unblock the pull request review process.

## Acceptance Criteria

1.  An `openapi.yaml` file is created within the `ai/mcp/server/github-workflow` directory.
2.  The specification includes the following endpoints:
    - A `GET /healthcheck` endpoint to verify server status and `gh` CLI accessibility.
    - A `GET /pull-requests` endpoint to list open PRs.
    - A `POST /pull-requests/{pr_number}/checkout` endpoint.
    - A `GET /pull-requests/{pr_number}/diff` endpoint.
3.  The specification defines clear request and response schemas for each endpoint.
4.  The initial draft is committed and pushed, allowing for further review and implementation.

