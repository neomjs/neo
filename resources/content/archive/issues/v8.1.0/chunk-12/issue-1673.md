---
id: 1673
title: 'model.Component: createDataProperties()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-30T12:52:04Z'
updatedAt: '2021-03-30T12:52:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1673'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-30T12:52:30Z'
---
# model.Component: createDataProperties()

extract the logic from `afterSetData()` into a new method to support calls for nested objects.

the method needs to recursively call itself for child data objects.

`createDataProperty()` needs to get adjusted to support different roots than `this.data`.

## Timeline

- 2021-03-30T12:52:04Z @tobiu added the `enhancement` label
- 2021-03-30T12:52:04Z @tobiu assigned to @tobiu
- 2021-03-30T12:52:24Z @tobiu referenced in commit `78a8d10` - "model.Component: createDataProperties() #1673"
- 2021-03-30T12:52:30Z @tobiu closed this issue

