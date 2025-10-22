---
id: 6891
title: 'addon.Base: intercept remotes which arrive before isReady equals true'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-29T09:15:44Z'
updatedAt: '2025-06-29T11:23:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6891'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-29T11:23:27Z'
---
# addon.Base: intercept remotes which arrive before isReady equals true

**Reported by:** @tobiu on 2025-06-29

* Common use case: files are not loaded yet.
* We need to solve this one generically => `worker.mixin.RemoteMethodAccess`, since other singletons can use it too.

