---
id: 7483
title: Implement PR Commenting Endpoint
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-14T10:47:59Z'
updatedAt: '2025-10-14T10:55:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7483'
author: tobiu
commentsCount: 1
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-14T10:55:39Z'
---
# Implement PR Commenting Endpoint

**Reported by:** @tobiu on 2025-10-14

---

**Parent Issue:** #7477 - Architect GitHub Workflow as MCP Server

---

To enable the agent to participate in code reviews, it needs the ability to post comments on pull requests. This ticket covers the implementation of a new endpoint on the GitHub Workflow MCP server for this purpose.

The endpoint will allow the agent to submit a comment for a specific pull request.

## Acceptance Criteria

1.  The `openapi.yaml` is updated with a new `POST /pull-requests/{pr_number}/comments` endpoint.
2.  The endpoint accepts a JSON body containing the `comment` text.
3.  A new `createComment` function is added to `pullRequestService.mjs`.
4.  The service function uses the `gh pr comment` command to post the comment to the specified pull request.
5.  The `routes/pullRequests.mjs` file is updated with the new route and handler.

## Comments

### @tobiu - 2025-10-14 10:55

<img width="519" height="140" alt="Image" src="https://github.com/user-attachments/assets/0e19a950-da39-4387-9f4c-54aa20a4e659" />

