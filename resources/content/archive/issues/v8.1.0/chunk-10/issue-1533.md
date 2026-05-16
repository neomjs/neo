---
id: 1533
title: 'SharedDialog.view.MainContainerController: mainWindowRect refactoring'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-16T21:50:48Z'
updatedAt: '2021-03-16T21:53:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1533'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-16T21:53:15Z'
---
# SharedDialog.view.MainContainerController: mainWindowRect refactoring

the config name `mainWindowRect` made sense at first, but now the class also supports dragging the dialog back from a docked window into the main window.

better name it `dragStartWindowRect` to avoid any confusion.

## Timeline

- 2021-03-16T21:50:49Z @tobiu added the `enhancement` label
- 2021-03-16T21:50:49Z @tobiu assigned to @tobiu
- 2021-03-16T21:53:09Z @tobiu referenced in commit `0813576` - "SharedDialog.view.MainContainerController: mainWindowRect refactoring #1533"
- 2021-03-16T21:53:15Z @tobiu closed this issue

