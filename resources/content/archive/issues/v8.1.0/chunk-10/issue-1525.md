---
id: 1525
title: 'dialog.Base: animateHide() => multi window context'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-09T15:18:46Z'
updatedAt: '2021-03-09T15:19:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1525'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-09T15:19:15Z'
---
# dialog.Base: animateHide() => multi window context

we can assume that the animation target and the dialog live within the same browser window (creating an animation across browser windows is not impossible, but very complex).

for the shared workers scope, we need to pass the appName into the `Neo.main.DomAccess.getBoundingClientRect()` call.

## Timeline

- 2021-03-09T15:18:46Z @tobiu added the `enhancement` label
- 2021-03-09T15:18:46Z @tobiu assigned to @tobiu
- 2021-03-09T15:19:08Z @tobiu referenced in commit `8ebd55b` - "dialog.Base: animateHide() => multi window context #1525"
- 2021-03-09T15:19:15Z @tobiu closed this issue

