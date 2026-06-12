---
id: 6831
title: 'main.DeltaUpdates: move relevant DomAccess configs over'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-18T00:14:32Z'
updatedAt: '2025-06-18T00:15:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6831'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-18T00:15:01Z'
---
# main.DeltaUpdates: move relevant DomAccess configs over

* `DeltaUpdates` was a mixin before, so only methods were copied, not configs
* this lead to configs being moved into the mixin owner, as a workaround
* now we can finally clean this part up

## Timeline

- 2025-06-18T00:14:32Z @tobiu assigned to @tobiu
- 2025-06-18T00:14:33Z @tobiu added the `enhancement` label
- 2025-06-18T00:14:58Z @tobiu referenced in commit `5aaf6e3` - "main.DeltaUpdates: move relevant DomAccess configs over #6831"
- 2025-06-18T00:15:01Z @tobiu closed this issue

