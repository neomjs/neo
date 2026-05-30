---
id: 1555
title: 'SharedDialog.view.MainContainerController: mountDialogInOtherWindow() => use mount()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-21T16:10:36Z'
updatedAt: '2021-03-21T16:11:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1555'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-21T16:11:06Z'
---
# SharedDialog.view.MainContainerController: mountDialogInOtherWindow() => use mount()

since we now have `hasUnmountedVdomChanges` in sync, we can replace the render() call with mount().

## Timeline

- 2021-03-21T16:10:36Z @tobiu added the `enhancement` label
- 2021-03-21T16:10:36Z @tobiu assigned to @tobiu
- 2021-03-21T16:10:51Z @tobiu referenced in commit `64b7090` - "SharedDialog.view.MainContainerController: mountDialogInOtherWindow() => use mount() #1555"
- 2021-03-21T16:11:06Z @tobiu closed this issue

