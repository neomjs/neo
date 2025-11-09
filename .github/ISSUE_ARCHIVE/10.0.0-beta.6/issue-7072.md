---
id: 7072
title: Add gatekeeping protection for non-neo singletons
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-16T02:45:57Z'
updatedAt: '2025-07-16T02:46:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7072'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-16T02:46:50Z'
---
# Add gatekeeping protection for non-neo singletons

**Reported by:** @tobiu on 2025-07-16

* `Neo.setupClass()` is an excellent gatekeeper for handling multiple envs in parallel.
* We need the same protection for modules which do not extend `core.Base`.

