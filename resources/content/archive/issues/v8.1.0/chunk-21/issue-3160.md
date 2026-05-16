---
id: 3160
title: 'controller.Component: parseConfig() => else if check'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-06-16T19:38:04Z'
updatedAt: '2022-06-16T19:38:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3160'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-16T19:38:24Z'
---
# controller.Component: parseConfig() => else if check

there is actually one `else if` check which needs to be an `else`. happened with the last changes to support view model string based store listeners.

## Timeline

- 2022-06-16T19:38:04Z @tobiu added the `bug` label
- 2022-06-16T19:38:04Z @tobiu assigned to @tobiu
- 2022-06-16T19:38:21Z @tobiu referenced in commit `a70f28d` - "controller.Component: parseConfig() => else if check #3160"
- 2022-06-16T19:38:24Z @tobiu closed this issue

