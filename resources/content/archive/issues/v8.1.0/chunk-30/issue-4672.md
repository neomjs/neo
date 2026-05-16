---
id: 4672
title: 'component.Base: needsVdomUpdate => needsVdomUpdate_'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-08-08T17:51:16Z'
updatedAt: '2023-08-08T17:58:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4672'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-08T17:58:53Z'
---
# component.Base: needsVdomUpdate => needsVdomUpdate_

and create an afterSetNeedsVdomUpdate() inside container.Base

if a roundtrip starts for a container, the entire vdom tree of all child containers / components will get sent to the vdom worker.

so it would be fair to say: all children on any levels can set their need update state to false.

same amount of deltas, but less calls to the engine.

## Timeline

- 2023-08-08T17:51:16Z @tobiu added the `enhancement` label
- 2023-08-08T17:51:16Z @tobiu assigned to @tobiu
- 2023-08-08T17:58:42Z @tobiu referenced in commit `1355ef5` - "component.Base: needsVdomUpdate => needsVdomUpdate_ #4672"
- 2023-08-08T17:58:49Z @tobiu changed title from **compoent.Base: needsVdomUpdate => needsVdomUpdate_** to **component.Base: needsVdomUpdate => needsVdomUpdate_**
- 2023-08-08T17:58:53Z @tobiu closed this issue

