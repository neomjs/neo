---
id: 6866
title: 'main.addon.Base: use async initAsync()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-24T22:18:49Z'
updatedAt: '2025-06-25T21:42:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6866'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-25T21:42:48Z'
---
# main.addon.Base: use async initAsync()

**Reported by:** @tobiu on 2025-06-24

* We will have a conflict regarding the soon coming core.Base: isReady_ config with addons.
* This is mostly intentional, since addons are supposed to now use the new core logic.
* Time to make this happen (and required before the next release).

