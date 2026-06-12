---
id: 4941
title: 'util.VDom: forceSyncVdomIds()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-09-22T15:14:26Z'
updatedAt: '2023-09-22T15:30:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4941'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-22T15:30:16Z'
---
# util.VDom: forceSyncVdomIds()

after changing the default logic of `syncVdomIds()`, we should add a new method which changes ids with force.

use cases are lists of nodes which get resorted or filtered and we want to use the same node ids to keep deltas smaller.

## Timeline

- 2023-09-22T15:14:27Z @tobiu added the `enhancement` label
- 2023-09-22T15:14:27Z @tobiu assigned to @tobiu
### @tobiu - 2023-09-22T15:15:14Z

actually, we could just add another param to `syncVdomIds()` instead.

- 2023-09-22T15:30:11Z @tobiu referenced in commit `27b293a` - "util.VDom: forceSyncVdomIds() #4941"
- 2023-09-22T15:30:17Z @tobiu closed this issue
- 2023-09-22T15:55:29Z @tobiu referenced in commit `1c2e6c7` - "v6.7.0 (#4942)

* util.VDom: forceSyncVdomIds() #4941

* component.Base: syncVnodeTree() => doc comment update

* component.DateSelector: cleanup

* v6.7.0"

