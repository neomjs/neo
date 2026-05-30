---
id: 1990
title: 'SharedDialog.view.MainContainerController: load the dialog css into the docked window on drag start'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-07T11:36:47Z'
updatedAt: '2021-05-07T11:43:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1990'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-07T11:43:10Z'
---
# SharedDialog.view.MainContainerController: load the dialog css into the docked window on drag start

The other window has most likely not loaded The dialog JS module yet, but the drag proxy is using some CSS rules of it.

## Timeline

- 2021-05-07T11:36:48Z @tobiu added the `enhancement` label
- 2021-05-07T11:36:48Z @tobiu assigned to @tobiu
- 2021-05-07T11:38:30Z @tobiu changed title from **haredDialog.view.MainContainerController: load the dialog css into the docked window on drag start** to **SharedDialog.view.MainContainerController: load the dialog css into the docked window on drag start**
- 2021-05-07T11:38:50Z @tobiu referenced in commit `d7baeac` - "SharedDialog.view.MainContainerController: load the dialog css into the docked window on drag start #1990"
- 2021-05-07T11:43:10Z @tobiu closed this issue

