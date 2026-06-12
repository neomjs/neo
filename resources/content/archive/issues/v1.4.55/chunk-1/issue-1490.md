---
id: 1490
title: 'SharedDialog.view.MainContainerController: createDialog() => pass the theme cls'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-01-18T12:22:55Z'
updatedAt: '2021-01-18T12:39:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1490'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-01-18T12:39:02Z'
---
# SharedDialog.view.MainContainerController: createDialog() => pass the theme cls

since the theme switching logic inside this demo app does not set the theme cls on the doc body, but on the main container div node, it does not affect dialogs (direct child nodes of the doc body).

we need to set the theme on the dialog top level as well when changing the theme here.

## Timeline

- 2021-01-18T12:22:55Z @tobiu added the `enhancement` label
- 2021-01-18T12:22:55Z @tobiu assigned to @tobiu
- 2021-01-18T12:38:57Z @tobiu referenced in commit `8cdff2e` - "SharedDialog.view.MainContainerController: createDialog() => pass the theme cls #1490"
- 2021-01-18T12:39:02Z @tobiu closed this issue

