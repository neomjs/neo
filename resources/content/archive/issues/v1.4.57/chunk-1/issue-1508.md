---
id: 1508
title: 'util.Rectangle: leavesSide(side)'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-02-04T09:06:27Z'
updatedAt: '2021-02-04T09:23:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1508'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-02-04T09:23:30Z'
---
# util.Rectangle: leavesSide(side)

e.g. for the cross winder drag&drop demo, we need a check if a dialog gets dragged pass an edge of a browser window.

this can happen for all 4 sides, so we should pass a `side` param with the values bottom, left, right, top.

## Timeline

- 2021-02-04T09:06:27Z @tobiu added the `enhancement` label
- 2021-02-04T09:06:27Z @tobiu assigned to @tobiu
- 2021-02-04T09:19:20Z @tobiu referenced in commit `b6cf641` - "util.Rectangle: leavesSide(side) #1508"
- 2021-02-04T09:23:30Z @tobiu closed this issue

