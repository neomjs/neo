---
id: 114
title: 'DeltaUpdates: du_insertNode()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2019-11-26T20:17:47Z'
updatedAt: '2019-11-26T20:19:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/114'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2019-11-26T20:19:26Z'
---
# DeltaUpdates: du_insertNode()

we need a switch to check if vtype:'text' nodes exist for a given parentNode.

if not, do the same as before (performance).

otherwise, use parentNode.childNodes (instead of parentNode.childres), filter out the comments to get the real index, get the new node from a template and insert it.

## Timeline

- 2019-11-26T20:17:47Z @tobiu added the `enhancement` label
- 2019-11-26T20:17:47Z @tobiu assigned to @tobiu
- 2019-11-26T20:18:14Z @tobiu referenced in commit `b0356d6` - "DeltaUpdates: du_insertNode() #114"
### @tobiu - 2019-11-26T20:19:26Z

done.

- 2019-11-26T20:19:26Z @tobiu closed this issue

