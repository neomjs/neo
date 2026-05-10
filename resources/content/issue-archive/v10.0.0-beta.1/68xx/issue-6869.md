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
blockedBy: []
blocking: []
closedAt: '2025-06-25T15:17:24Z'
---
# core.Base: remote => remote_

* Allows us to define `beforeSetRemote()`
* The new method should contain the singleton check (instead of `initRemote()`)
* a potential error will get thrown earlier inside the instance lifecycle

## Timeline

- 2025-06-25T15:16:46Z @tobiu assigned to @tobiu
- 2025-06-25T15:16:48Z @tobiu added the `enhancement` label
- 2025-06-25T15:17:16Z @tobiu referenced in commit `ddda487` - "core.Base: remote => remote_ #6869"
- 2025-06-25T15:17:24Z @tobiu closed this issue

