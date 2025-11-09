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
closedAt: '2025-07-05T10:31:28Z'
---
# Neo.cloneMap

**Reported by:** @tobiu on 2025-07-05

* Let us move the `cloneMap` part outside `Neo.clone()`
* Rationale: this avoids regenerating it every time the method is called.
* Let us also remove fat arrows here => performance gain, since bindings are not needed here.

