---
id: 1594
title: 'model.Component: parseConfig() => logic'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-27T12:48:38Z'
updatedAt: '2021-03-27T12:50:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1594'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-27T12:50:35Z'
---
# model.Component: parseConfig() => logic

we can not store bindings yet, since child component ids most likely do not exist yet.

however, we can already resolve the binding values.

it makes sense, since this is the earliest possible point inside the component lifecycle.

## Timeline

- 2021-03-27T12:48:38Z @tobiu added the `enhancement` label
- 2021-03-27T12:48:39Z @tobiu assigned to @tobiu
- 2021-03-27T12:48:53Z @tobiu referenced in commit `52c4e1c` - "model.Component: parseConfig() => logic #1594"
- 2021-03-27T12:50:35Z @tobiu closed this issue

