---
id: 6865
title: 'core.Base: change the public is ready class field to an isReady_ config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-24T22:17:10Z'
updatedAt: '2025-06-25T15:15:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6865'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-25T15:15:02Z'
---
# core.Base: change the public is ready class field to an isReady_ config

**Reported by:** @tobiu on 2025-06-24

Rationale:

* core.Base does not use the observable mixin.
* using a real config, devs can easily "listen" to `afterSetIsReady()` => getting a notification once the async initialization is done.

