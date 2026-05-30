---
id: 6098
title: 'component.Base: isParentVdomUpdating() => honor the updateDepth'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-11T10:03:10Z'
updatedAt: '2024-11-11T10:40:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6098'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-11T10:40:44Z'
---
# component.Base: isParentVdomUpdating() => honor the updateDepth

for v8 we need to honor the distance to allow updates in parallel, in case there is no conflict.

* currentUpdateDepth = -1 => conflict
* currentUpdateDepth >= distance => conflict

we need a new param for the (component tree) distance.

## Timeline

- 2024-11-11T10:03:10Z @tobiu added the `enhancement` label
- 2024-11-11T10:03:10Z @tobiu assigned to @tobiu
- 2024-11-11T10:40:20Z @tobiu referenced in commit `f40cb52` - "component.Base: isParentVdomUpdating() => honor the updateDepth #6098"
- 2024-11-11T10:40:44Z @tobiu closed this issue

