---
id: 1751
title: 'model.Component: setData() & setDataAtSameLevel() code redundancy'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-10T20:40:25Z'
updatedAt: '2021-04-10T20:40:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1751'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-10T20:40:50Z'
---
# model.Component: setData() & setDataAtSameLevel() code redundancy

the methods are very similar.

I will add a new method called `internalSetData()` which both methods can call with a different flag.

## Timeline

- 2021-04-10T20:40:25Z @tobiu added the `enhancement` label
- 2021-04-10T20:40:25Z @tobiu assigned to @tobiu
- 2021-04-10T20:40:44Z @tobiu referenced in commit `ca4f35e` - "model.Component: setData() & setDataAtSameLevel() code redundancy #1751"
- 2021-04-10T20:40:50Z @tobiu closed this issue
- 2021-04-10T20:43:47Z @tobiu referenced in commit `250d982` - "#1751 comment cleanup"

