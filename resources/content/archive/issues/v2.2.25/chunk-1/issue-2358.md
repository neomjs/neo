---
id: 2358
title: 'model.Component: support for non string based bindings'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-13T19:40:24Z'
updatedAt: '2021-06-13T19:43:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2358'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-13T19:43:15Z'
---
# model.Component: support for non string based bindings

formatter fns so far required the template literals syntax.

e.g.
```
bind: {
    enableResizingAcrossOppositeEdge: data => `${data.enableEventResizingAcrossOppositeEdge}`
},
```

however, there are use cases where you want to bind to a {Boolean} or {Number} or non primitives, so we need an alternative syntax to support this:

```
bind: {
    enableResizingAcrossOppositeEdge: data => data.enableEventResizingAcrossOppositeEdge
},
```

## Timeline

- 2021-06-13T19:40:24Z @tobiu added the `enhancement` label
- 2021-06-13T19:40:24Z @tobiu assigned to @tobiu
- 2021-06-13T19:43:00Z @tobiu referenced in commit `7d69239` - "model.Component: support for non string based bindings #2358"
- 2021-06-13T19:43:15Z @tobiu closed this issue

