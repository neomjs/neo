---
id: 5951
title: 'Portal.view.learn.ContentComponent: missing destroy() logic'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-21T14:40:52Z'
updatedAt: '2024-09-21T16:26:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5951'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-21T16:26:42Z'
---
# Portal.view.learn.ContentComponent: missing destroy() logic

@maxrahder @rwaters:

the logic is creating `code.LivePreview` instances which will stick in memory forever. while the portal app will never destroy its one instance, we should still aim for creating re-useable components.

i will take care of this one.

## Timeline

- 2024-09-21T14:40:52Z @tobiu added the `enhancement` label
- 2024-09-21T14:40:52Z @tobiu assigned to @tobiu
- 2024-09-21T14:44:03Z @tobiu cross-referenced by #5952
- 2024-09-21T16:26:28Z @tobiu referenced in commit `c23ddf9` - "Portal.view.learn.ContentComponent: missing destroy() logic #5951"
### @tobiu - 2024-09-21T16:26:42Z

![Screenshot 2024-09-21 at 18 25 46](https://github.com/user-attachments/assets/ecdc4258-e3d3-43c1-b38f-a9f2d9ea5341)


- 2024-09-21T16:26:42Z @tobiu closed this issue

