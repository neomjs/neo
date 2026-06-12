---
id: 5510
title: 'Portal.view.home.parts.Helix: will-change style property'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-07-01T12:55:14Z'
updatedAt: '2024-07-01T12:57:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5510'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-01T12:57:24Z'
---
# Portal.view.home.parts.Helix: will-change style property

In case we are deeply nesting the helix inside the DOM tree, we get display errors in chrome and firefox starts complaining:

> Will-change memory consumption is too high. Budget limit is the document surface area multiplied by 3 (1275322 px). Occurrences of will-change over the budget will be ignored.

This does not happen, in case we use the helix inside the covid app or standalone examples.
![Screenshot 2024-07-01 at 14 51 49](https://github.com/neomjs/neo/assets/1177434/b2b15c5a-0e3a-44a9-8821-606b47b82c1f)


## Timeline

- 2024-07-01T12:55:14Z @tobiu added the `bug` label
- 2024-07-01T12:55:14Z @tobiu assigned to @tobiu
- 2024-07-01T12:56:45Z @tobiu referenced in commit `a62bea3` - "Portal.view.home.parts.Helix: will-change style property #5510"
### @tobiu - 2024-07-01T12:57:25Z

![Screenshot 2024-07-01 at 14 57 13](https://github.com/neomjs/neo/assets/1177434/5e0a1ac6-642d-4fd6-8dec-8882877c0476)


- 2024-07-01T12:57:25Z @tobiu closed this issue
- 2024-07-01T14:14:29Z @tobiu cross-referenced by #5509

