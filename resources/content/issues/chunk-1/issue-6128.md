---
id: 6128
title: 'manager.Focus: history => scope the content to windowIds'
state: OPEN
labels:
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2024-11-22T11:00:15Z'
updatedAt: '2024-11-22T11:00:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6128'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# manager.Focus: history => scope the content to windowIds

for the multi-window scope, it would be nice to have a separated focus history for each connected window.

![Image](https://github.com/user-attachments/assets/d0067ed4-5957-4029-ba87-b977a8bea82e)

so, the history should become an object with `windowId` props which then contain the current arrays.

closing a browser window should clear the related history.

## Timeline

- 2024-11-22T11:00:15Z @tobiu added the `enhancement` label
- 2024-11-22T11:00:15Z @tobiu added the `no auto close` label
- 2024-11-22T11:00:15Z @tobiu assigned to @tobiu

