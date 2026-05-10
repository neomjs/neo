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
blockedBy: []
blocking: []
closedAt: '2025-07-07T17:55:43Z'
---
# core.Base: isDestroying_ reactive config

* This config will be set to `true` as the very first action within the `destroy()` method.
* Effects can observe this config to clean themselves up.
* Use case is e.g. `state.Provider`

## Timeline

- 2025-07-07T17:54:52Z @tobiu assigned to @tobiu
- 2025-07-07T17:54:54Z @tobiu added the `enhancement` label
- 2025-07-07T17:55:30Z @tobiu referenced in commit `c8dcc0b` - "core.Base: isDestroying_ reactive config #6977"
- 2025-07-07T17:55:43Z @tobiu closed this issue
- 2025-07-09T00:10:51Z @tobiu referenced in commit `474a79d` - "core.Base: isDestroying_ reactive config #6977"

