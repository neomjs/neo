---
id: 1487
title: 'SharedDialog.view.MainContainerController: onAppConnect() => register the main app'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-01-18T09:51:08Z'
updatedAt: '2021-01-18T09:51:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1487'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-01-18T09:51:49Z'
---
# SharedDialog.view.MainContainerController: onAppConnect() => register the main app

we need to add the main app (SharedDialog) to the connectedApps array, otherwise the theme switch won't work for the main window.

## Timeline

- 2021-01-18T09:51:08Z @tobiu added the `bug` label
- 2021-01-18T09:51:08Z @tobiu assigned to @tobiu
- 2021-01-18T09:51:34Z @tobiu referenced in commit `795a4af` - "SharedDialog.view.MainContainerController: onAppConnect() => register the main app #1487"
- 2021-01-18T09:51:49Z @tobiu closed this issue
- 2021-01-18T09:57:59Z @tobiu cross-referenced by #1488

