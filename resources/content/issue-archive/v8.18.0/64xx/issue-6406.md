---
id: 6406
title: 'component.Base: afterSetIsLoading() => wrapperCls'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-08T12:45:19Z'
updatedAt: '2025-02-08T12:45:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6406'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-08T12:45:57Z'
---
# component.Base: afterSetIsLoading() => wrapperCls

* The mask will always get applied as a child to the top-level vdom node
* Using `cls` is not sufficient, because when using wrapper nodes, `neo-masked` and the loading mask node can end up as siblings, breaking the styling

## Timeline

- 2025-02-08T12:45:19Z @tobiu added the `enhancement` label
- 2025-02-08T12:45:19Z @tobiu assigned to @tobiu
- 2025-02-08T12:45:49Z @tobiu referenced in commit `297b4cb` - "component.Base: afterSetIsLoading() => wrapperCls #6406"
- 2025-02-08T12:45:57Z @tobiu closed this issue

