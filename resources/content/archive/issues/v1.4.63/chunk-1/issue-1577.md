---
id: 1577
title: 'component.Base: getModel()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-25T08:40:17Z'
updatedAt: '2021-03-25T08:50:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1577'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-25T08:50:45Z'
---
# component.Base: getModel()

since not every component has its own model, the method should return the model instance in case it exists, otherwise return the closest model it finds inside the parent tree.

similar to `getController()`.

## Timeline

- 2021-03-25T08:40:17Z @tobiu added the `enhancement` label
- 2021-03-25T08:40:18Z @tobiu assigned to @tobiu
- 2021-03-25T08:50:32Z @tobiu referenced in commit `df9c536` - "component.Base: getModel() #1577"
- 2021-03-25T08:50:45Z @tobiu closed this issue

