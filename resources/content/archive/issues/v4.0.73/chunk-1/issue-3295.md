---
id: 3295
title: Neo.config.loadApplicationDelay
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-07-18T08:42:00Z'
updatedAt: '2022-07-18T08:46:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3295'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-18T08:46:09Z'
---
# Neo.config.loadApplicationDelay

`worker.Manager:onWorkerConstructed()` is using a fixed value for a timeout (20ms), to delay the app start.

depending on your environments and setups, the registration time of remote methods can vary and there might be other reasons to delay the startup time further.

## Timeline

- 2022-07-18T08:42:00Z @tobiu added the `enhancement` label
- 2022-07-18T08:42:00Z @tobiu assigned to @tobiu
- 2022-07-18T08:45:29Z @tobiu referenced in commit `42862f0` - "Neo.config.loadApplicationDelay #3295"
- 2022-07-18T08:46:09Z @tobiu closed this issue

