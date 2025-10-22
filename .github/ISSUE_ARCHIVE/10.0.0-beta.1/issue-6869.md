---
id: 6869
title: 'core.Base: remote => remote_'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-25T15:16:46Z'
updatedAt: '2025-06-25T15:17:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6869'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-25T15:17:24Z'
---
# core.Base: remote => remote_

**Reported by:** @tobiu on 2025-06-25

* Allows us to define `beforeSetRemote()`
* The new method should contain the singleton check (instead of `initRemote()`)
* a potential error will get thrown earlier inside the instance lifecycle

