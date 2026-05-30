---
id: 1683
title: 'model.Component: removeBindings(componentId)'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-31T12:57:12Z'
updatedAt: '2021-03-31T15:36:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1683'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-31T15:36:37Z'
---
# model.Component: removeBindings(componentId)

add a new method which removes all bindings matching a given componentId.
the method needs to trigger itself on all methods inside the parent component tree chain.

a `destroy()` call for a component should trigger it on the closest parent model.
there is no need to call it on a model on the same level, since this one will get destroyed as well.

## Timeline

- 2021-03-31T12:57:12Z @tobiu added the `enhancement` label
- 2021-03-31T12:57:12Z @tobiu assigned to @tobiu
- 2021-03-31T15:36:30Z @tobiu referenced in commit `23665e3` - "model.Component: removeBindings(componentId) #1683"
- 2021-03-31T15:36:37Z @tobiu closed this issue

