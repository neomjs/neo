---
id: 7559
title: Convert pullRequestService to PullRequestService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-19T22:57:15Z'
updatedAt: '2025-10-19T22:58:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7559'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-19T22:58:05Z'
---
# Convert pullRequestService to PullRequestService Neo.mjs Class

**Reported by:** @tobiu on 2025-10-19

---

**Parent Issue:** #7536 - Epic: Integrate Neo.mjs Core into MCP Servers

---

This ticket covers refactoring the final service for the `github-workflow` server, `ai/mcp/server/github-workflow/services/pullRequestService.mjs`, into a singleton `PullRequestService` class. This service handles all interactions with GitHub Pull Requests.

## Acceptance Criteria

1.  The file `ai/mcp/server/github-workflow/services/pullRequestService.mjs` is renamed to `PullRequestService.mjs`.
2.  The content is replaced with a `PullRequestService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  All existing functions (`listPullRequests`, `checkoutPullRequest`, `getPullRequestDiff`, `createComment`, `getConversation`) are converted into class methods.
4.  All methods are updated to return a structured error object on failure, instead of throwing an exception.
5.  The `ai/mcp/server/github-workflow/services/toolService.mjs` is updated to use the new `PullRequestService` class.
6.  All related tools (`list_pull_requests`, `checkout_pull_request`, etc.) continue to function correctly after the refactoring.

