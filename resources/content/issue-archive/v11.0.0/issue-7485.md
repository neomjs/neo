---
id: 7485
title: Manage Repository Labels
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-14T11:23:58Z'
updatedAt: '2025-10-14T11:48:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7485'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-14T11:48:09Z'
---
# Manage Repository Labels

To fully automate the issue and PR workflow, the agent needs the ability to manage labels. This includes listing all available repository labels and adding or removing labels from a specific issue or pull request.

This ticket covers the implementation of endpoints for repository-wide label management.

## Acceptance Criteria

1.  The `openapi.yaml` is updated with endpoints for listing labels and modifying them on an issue/PR.
2.  A new `labelService.mjs` is created to wrap the `gh label list` command.
3.  A new `issueService.mjs` is created with functions to add/remove labels using `gh issue edit`.
4.  New route files and handlers are created for the `/labels` and `/issues` resources.

## Timeline

- 2025-10-14T11:23:58Z @tobiu assigned to @tobiu
- 2025-10-14T11:24:00Z @tobiu added parent issue #7477
- 2025-10-14T11:24:00Z @tobiu added the `enhancement` label
- 2025-10-14T11:24:00Z @tobiu added the `ai` label
- 2025-10-14T11:42:56Z @tobiu referenced in commit `c7288b9` - "Manage Repository Labels #7485"
- 2025-10-14T11:48:09Z @tobiu closed this issue

