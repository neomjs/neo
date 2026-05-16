---
id: 5432
title: 'Portal.view.ViewportController: onAppConnect()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-06-22T12:42:49Z'
updatedAt: '2024-06-22T12:45:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5432'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-22T12:45:30Z'
---
# Portal.view.ViewportController: onAppConnect()

Since we now want to show `LivePreview` components inside the main landing page, we can not keep the preview (popup-window) logic inside `Portal.view.learn.MainContainerController`.

Rationale: a user can just navigate to the `#/home` route, in which case the learning-content-controller does not exist. So, we need to move this part upwards.

@maxrahder @Dinkh 

## Timeline

- 2024-06-22T12:42:49Z @tobiu added the `enhancement` label
- 2024-06-22T12:42:49Z @tobiu assigned to @tobiu
- 2024-06-22T12:44:34Z @tobiu referenced in commit `ad9c2ba` - "Portal.view.ViewportController: onAppConnect() #5432"
- 2024-06-22T12:45:30Z @tobiu closed this issue

