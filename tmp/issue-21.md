---
id: 21
title: Commander program opts sanitizing
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-12-02T10:07:23Z'
updatedAt: '2025-12-02T10:07:47Z'
githubUrl: 'https://github.com/neomjs/create-app/issues/21'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T10:07:47Z'
---
# Commander program opts sanitizing

I did assume that commander would sanitize input values, but this is not the case.

A user tried `-t "all"` instead of `-t all`, and this was not handled gracefully.

## Activity Log

- 2025-12-02 @tobiu assigned to @tobiu
- 2025-12-02 @tobiu added the `enhancement` label
- 2025-12-02 @tobiu referenced in commit `98d0431` - "Commander program opts sanitizing #21"
- 2025-12-02 @tobiu closed this issue

