---
id: 4596
title: 'controller.Component: mapping string based button handlers into controllers'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-07-30T21:18:17Z'
updatedAt: '2023-07-30T21:22:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4596'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-30T21:22:30Z'
---
# controller.Component: mapping string based button handlers into controllers

when refactoring `button.Base`, the handler no longer gets converted into an own listener. view controllers need to get adjusted to replace the handler string directly inside the button class itself.

## Timeline

- 2023-07-30T21:18:17Z @tobiu added the `bug` label
- 2023-07-30T21:18:17Z @tobiu assigned to @tobiu
- 2023-07-30T21:22:00Z @tobiu referenced in commit `6943142` - "controller.Component: mapping string based button handlers into controllers #4596"
- 2023-07-30T21:22:30Z @tobiu closed this issue

