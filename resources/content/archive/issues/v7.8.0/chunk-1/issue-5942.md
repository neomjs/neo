---
id: 5942
title: 'SharedDialog.view.MainContainerController: onDialogClose() => clear the internal reference'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-21T08:46:00Z'
updatedAt: '2024-09-21T08:46:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5942'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-21T08:46:16Z'
---
# SharedDialog.view.MainContainerController: onDialogClose() => clear the internal reference

* we are not hiding the dialog on unmount, but are destroying the instance (this could get changed)
* for the current setting it is crucial to not let the internal reference point to a destroyed instance.

## Timeline

- 2024-09-21T08:46:00Z @tobiu added the `enhancement` label
- 2024-09-21T08:46:00Z @tobiu assigned to @tobiu
- 2024-09-21T08:46:14Z @tobiu referenced in commit `573bddd` - "SharedDialog.view.MainContainerController: onDialogClose() => clear the internal reference #5942"
- 2024-09-21T08:46:16Z @tobiu closed this issue

