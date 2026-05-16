---
id: 5206
title: Enable extending main thread addons
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-02-08T14:24:11Z'
updatedAt: '2024-02-10T15:06:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5206'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-02-10T15:06:20Z'
---
# Enable extending main thread addons

Historically, main threads addons were defined as singletons, since it was impossible to change them.

Afterwards, workspaces got the feature to define their own custom addons.

At this point it makes sense if custom addons can extend framework addons, in case devs want to change / override specific logic on their own.

## Timeline

- 2024-02-08T14:24:11Z @tobiu added the `enhancement` label
- 2024-02-08T14:24:12Z @tobiu assigned to @tobiu
- 2024-02-10T15:06:15Z @tobiu referenced in commit `bd7fef3` - "Enable extending main thread addons #5206"
- 2024-02-10T15:06:20Z @tobiu closed this issue
- 2024-03-26T16:29:29Z @tobiu referenced in commit `5a9f965` - "Enable extending main thread addons #5206"

