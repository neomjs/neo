---
id: 1488
title: 'SharedDialog.view.MainContainerController: onAppDisconnect() => exclude the main app for windowClose()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2021-01-18T09:57:59Z'
updatedAt: '2021-01-18T09:58:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1488'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-01-18T09:58:21Z'
---
# SharedDialog.view.MainContainerController: onAppDisconnect() => exclude the main app for windowClose()

follow up for https://github.com/neomjs/neo/issues/1487

we need to remove "SharedDialog" from the connectedApps array before calling `windowClose()`.



## Timeline

- 2021-01-18T09:57:59Z @tobiu added the `bug` label
- 2021-01-18T09:57:59Z @tobiu assigned to @tobiu
- 2021-01-18T09:58:17Z @tobiu referenced in commit `9ca1e38` - "SharedDialog.view.MainContainerController: onAppDisconnect() => exclude the main app for windowClose() #1488"
- 2021-01-18T09:58:21Z @tobiu closed this issue

