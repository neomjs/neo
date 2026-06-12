---
id: 5952
title: 'Portal.view.learn.ContentComponent: on record change => existing neo child instances'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-21T14:44:02Z'
updatedAt: '2024-09-21T19:22:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5952'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-21T19:22:47Z'
---
# Portal.view.learn.ContentComponent: on record change => existing neo child instances

related to: https://github.com/neomjs/neo/issues/5951

@maxrahder @rwaters:
it should work more like a component based list => if the current view has 5 LivePreview instances and the new view needs 3, let us re-use the existing 3 and create 2 new ones. delete "overflowing" instances.

i will work on it.

## Timeline

- 2024-09-21T14:44:02Z @tobiu added the `enhancement` label
- 2024-09-21T14:44:03Z @tobiu assigned to @tobiu
- 2024-09-21T19:22:19Z @tobiu referenced in commit `f63bfa8` - "Portal.view.learn.ContentComponent: on record change => existing neo child instances #5952"
### @tobiu - 2024-09-21T19:22:47Z

just destroying all child instances for now. we can open a follow-up ticket for re-using them.

- 2024-09-21T19:22:47Z @tobiu closed this issue

