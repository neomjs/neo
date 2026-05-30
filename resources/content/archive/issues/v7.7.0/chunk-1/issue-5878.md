---
id: 5878
title: 'SharedDialog.view.MainContainerController: adjust to the proxyless dialog'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-11T21:23:45Z'
updatedAt: '2024-09-20T16:52:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5878'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-20T16:52:33Z'
---
# SharedDialog.view.MainContainerController: adjust to the proxyless dialog

this one is tricky, since we no longer have the proxy logic working like before.

to re-enable dragging a dialog into a different browser window, we need to enhance the x-browser-window delta CSS update logic. meaning: we need to parse the dialog instance for all items and register their CSS inside the connected window when a drag OP is running.

## Timeline

- 2024-09-11T21:23:45Z @tobiu added the `enhancement` label
- 2024-09-11T21:23:45Z @tobiu assigned to @tobiu
- 2024-09-11T21:24:11Z @tobiu referenced in commit `ce6edba` - "#5878 SharedDialog.view.MainContainerController: adjust to the proxyless dialog WIP"
### @tobiu - 2024-09-20T16:51:17Z

there is actually still a proxy in place. i will push the related fixes into this ticket.

- 2024-09-20T16:52:31Z @tobiu referenced in commit `bb09740` - "#5878 fixed the app logic"
- 2024-09-20T16:52:34Z @tobiu closed this issue

