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
closedAt: '2025-06-18T00:15:01Z'
---
# main.DeltaUpdates: move relevant DomAccess configs over

**Reported by:** @tobiu on 2025-06-18

* `DeltaUpdates` was a mixin before, so only methods were copied, not configs
* this lead to configs being moved into the mixin owner, as a workaround
* now we can finally clean this part up

