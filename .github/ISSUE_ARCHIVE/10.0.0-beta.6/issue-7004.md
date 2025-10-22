---
id: 7004
title: 'core.Effect: simplify the constructor signature'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-07-10T13:17:14Z'
updatedAt: '2025-07-10T13:17:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7004'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-10T13:17:48Z'
---
# core.Effect: simplify the constructor signature

**Reported by:** @tobiu on 2025-07-10

* Current state: an object based param, containing `fn`
* `fn` is the only available and used param inside the object
* the new param should just be `fn`

