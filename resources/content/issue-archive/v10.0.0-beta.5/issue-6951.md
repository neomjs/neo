---
id: 6951
title: Neo.cloneMap
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-05T10:28:21Z'
updatedAt: '2025-07-05T10:31:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6951'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-05T10:31:28Z'
---
# Neo.cloneMap

* Let us move the `cloneMap` part outside `Neo.clone()`
* Rationale: this avoids regenerating it every time the method is called.
* Let us also remove fat arrows here => performance gain, since bindings are not needed here.

## Timeline

- 2025-07-05T10:28:21Z @tobiu assigned to @tobiu
- 2025-07-05T10:28:23Z @tobiu added the `enhancement` label
- 2025-07-05T10:31:07Z @tobiu referenced in commit `b54b761` - "Neo.cloneMap #6951"
- 2025-07-05T10:31:28Z @tobiu closed this issue

