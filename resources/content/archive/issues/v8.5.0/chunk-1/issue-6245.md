---
id: 6245
title: 'Portal.view.learn.ContentComponent: sometimes LivePreviews get rendered twice'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-01-16T13:57:58Z'
updatedAt: '2025-01-16T13:59:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6245'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-16T13:59:44Z'
---
# Portal.view.learn.ContentComponent: sometimes LivePreviews get rendered twice

@maxrahder 

The components get created using `autoRender: true` & `autoMount: true`, but `afterSetMounted()` is also triggering `render()` calls.

![Image](https://github.com/user-attachments/assets/938b4840-0e57-4990-9ee1-ecaee54094a5)

## Timeline

- 2025-01-16T13:57:58Z @tobiu added the `bug` label
- 2025-01-16T13:57:58Z @tobiu assigned to @tobiu
- 2025-01-16T13:59:36Z @tobiu referenced in commit `f0d69af` - "Portal.view.learn.ContentComponent: sometimes LivePreviews get rendered twice #6245"
- 2025-01-16T13:59:44Z @tobiu closed this issue

