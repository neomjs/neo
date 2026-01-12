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
blockedBy: []
blocking: []
closedAt: '2025-06-25T21:42:48Z'
---
# main.addon.Base: use async initAsync()

* We will have a conflict regarding the soon coming core.Base: isReady_ config with addons.
* This is mostly intentional, since addons are supposed to now use the new core logic.
* Time to make this happen (and required before the next release).

## Timeline

- 2025-06-24T22:18:49Z @tobiu assigned to @tobiu
- 2025-06-24T22:18:50Z @tobiu added the `enhancement` label
- 2025-06-25T19:56:18Z @tobiu referenced in commit `e631fb5` - "main.addon.Base: use async initAsync() #6866 WIP"
- 2025-06-25T20:28:58Z @tobiu referenced in commit `ac571a4` - "main.addon.Base: use async initAsync() #6866"
- 2025-06-25T21:42:48Z @tobiu closed this issue

