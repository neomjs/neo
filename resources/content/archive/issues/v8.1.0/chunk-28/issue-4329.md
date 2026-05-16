---
id: 4329
title: 'component.Base: getMountedParentIndex()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-04-27T12:55:25Z'
updatedAt: '2023-04-27T12:57:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4329'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-04-27T12:57:20Z'
---
# component.Base: getMountedParentIndex()

In cases we want to dynamically show or hide items inside a given items array of a container, the vdom or container.items index is not sufficient. we need to exclude hidden items with hideMode: 'removeDom'.

## Timeline

- 2023-04-27T12:55:25Z @tobiu added the `enhancement` label
- 2023-04-27T12:55:26Z @tobiu assigned to @tobiu
- 2023-04-27T12:56:30Z @tobiu referenced in commit `a8ae543` - "component.Base: getMountedParentIndex() #4329"
- 2023-04-27T12:57:20Z @tobiu closed this issue

