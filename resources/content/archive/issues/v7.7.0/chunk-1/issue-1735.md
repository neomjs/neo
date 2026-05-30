---
id: 1735
title: 'SharedDialog.view.MainContainerController: enhance the demo to support gaps between windows'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - stale
assignees: []
createdAt: '2021-04-08T14:30:10Z'
updatedAt: '2024-09-18T02:28:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1735'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-18T02:28:44Z'
---
# SharedDialog.view.MainContainerController: enhance the demo to support gaps between windows

example: a user could manually drag a docked window away from the main window or apps could position windows initially not right next to each other.

Obviously, there is no visible drag proxy in place when dragging not over browser windows.

To implement this `onDragStart()` needs to call `Neo.Main.getWindowData()` on all connected windows. The returning `data` object contains e.g. screenLeft, screenTop, otherHeight, outerWidth => calculating gaps is fairly easy.

Adding the label "good first issue", since it does not require deeper knowledge of the framework.

Adding the label "help wanted", since it is not a high priority item (unless many users ask for it).

A lot of other tasks on my plate.

## Timeline

- 2021-04-08T14:30:10Z @tobiu added the `enhancement` label
- 2021-04-08T14:30:10Z @tobiu added the `help wanted` label
- 2021-04-08T14:30:10Z @tobiu added the `good first issue` label
### @github-actions - 2024-09-04T02:27:36Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-04T02:27:36Z @github-actions added the `stale` label
### @github-actions - 2024-09-18T02:28:44Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-18T02:28:44Z @github-actions closed this issue

