---
id: 6977
title: 'core.Base: isDestroying_ reactive config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-07T17:54:52Z'
updatedAt: '2025-07-07T17:55:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6977'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-07T17:55:43Z'
---
# core.Base: isDestroying_ reactive config

**Reported by:** @tobiu on 2025-07-07

* This config will be set to `true` as the very first action within the `destroy()` method.
* Effects can observe this config to clean themselves up.
* Use case is e.g. `state.Provider`

