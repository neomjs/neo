---
id: 6683
title: 'grid.column.Component: useBindings config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-04-23T14:15:46Z'
updatedAt: '2025-04-23T14:19:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6683'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-23T14:19:06Z'
---
# grid.column.Component: useBindings config

* Using bindings inside component based cell renderers is expensive, since we need to rebind inside every re-rendering
* Since this is not needed for most use cases, I will add a flag to only parse for bindings when required

## Timeline

- 2025-04-23T14:15:46Z @tobiu added the `enhancement` label
- 2025-04-23T14:15:46Z @tobiu assigned to @tobiu
- 2025-04-23T14:18:52Z @tobiu referenced in commit `ef18bd0` - "grid.column.Component: useBindings config #6683"
- 2025-04-23T14:19:06Z @tobiu closed this issue

