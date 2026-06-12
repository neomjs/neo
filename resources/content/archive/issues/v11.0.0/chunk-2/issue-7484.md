---
id: 7484
title: Get PR Conversation History
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-14T10:56:47Z'
updatedAt: '2025-10-14T11:08:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7484'
author: tobiu
commentsCount: 1
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-14T11:08:54Z'
---
# Get PR Conversation History

For an agent to effectively review and comment on a pull request, it needs the full context of the conversation. This includes the PR's title, description (body), and all previous comments.

This ticket covers implementing a new endpoint to retrieve this complete conversation history for a given pull request.

## Acceptance Criteria

1.  The `openapi.yaml` is updated with a new `GET /pull-requests/{pr_number}/conversation` endpoint.
2.  A new `getConversation` function is added to `pullRequestService.mjs`.
3.  The service function uses the `gh pr view <PR_NUMBER> --json title,body,comments` command to fetch the data.
4.  The `routes/pullRequests.mjs` file is updated with the new route and handler.

## Timeline

- 2025-10-14T10:56:48Z @tobiu assigned to @tobiu
- 2025-10-14T10:56:49Z @tobiu added the `enhancement` label
- 2025-10-14T10:56:49Z @tobiu added parent issue #7477
- 2025-10-14T10:56:49Z @tobiu added the `ai` label
- 2025-10-14T11:08:43Z @tobiu referenced in commit `260d029` - "Get PR Conversation History #7484"
### @tobiu - 2025-10-14T11:08:54Z

<img width="841" height="782" alt="Image" src="https://github.com/user-attachments/assets/42db4bbe-2e71-4c37-a5e5-3d4d8e990a9b" />

- 2025-10-14T11:08:54Z @tobiu closed this issue

