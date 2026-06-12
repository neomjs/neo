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
blockedBy: []
blocking: []
closedAt: '2025-06-25T15:15:02Z'
---
# core.Base: change the public is ready class field to an isReady_ config

Rationale:

* core.Base does not use the observable mixin.
* using a real config, devs can easily "listen" to `afterSetIsReady()` => getting a notification once the async initialization is done.

## Timeline

- 2025-06-24T22:17:10Z @tobiu assigned to @tobiu
- 2025-06-24T22:17:11Z @tobiu added the `enhancement` label
- 2025-06-25T14:33:53Z @tobiu referenced in commit `20ce481` - "core.Base: change the public is ready class field to an isReady_ config #6865"
- 2025-06-25T15:15:02Z @tobiu closed this issue

