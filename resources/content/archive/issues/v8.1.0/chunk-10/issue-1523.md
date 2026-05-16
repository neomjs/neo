---
id: 1523
title: 'SharedDialog.view.MainContainerController: onWindowClose() => onDialogClose()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-09T14:58:34Z'
updatedAt: '2021-03-09T15:07:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1523'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-09T15:07:41Z'
---
# SharedDialog.view.MainContainerController: onWindowClose() => onDialogClose()

"onWindowClose" is confusing in this context, since the listener triggers when closing the dialog and not the docked window.

## Timeline

- 2021-03-09T14:58:34Z @tobiu added the `enhancement` label
- 2021-03-09T14:58:35Z @tobiu assigned to @tobiu
- 2021-03-09T14:59:12Z @tobiu referenced in commit `c3cc78e` - "SharedDialog.view.MainContainerController: onWindowClose() => onDialogClose() #1523"
- 2021-03-09T15:07:41Z @tobiu closed this issue

