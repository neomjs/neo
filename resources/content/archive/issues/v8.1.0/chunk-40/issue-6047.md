---
id: 6047
title: 'util.VDom: syncVdomIds() => map the vdom of direct children'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-05T12:30:58Z'
updatedAt: '2024-11-05T13:43:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6047'
author: tobiu
commentsCount: 0
parentIssue: 6045
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-05T12:31:59Z'
---
# util.VDom: syncVdomIds() => map the vdom of direct children

the `removeDom` flag is only set on real vdom objects, not inside component references, so we can not filter the nodes accordingly otherwise.

## Timeline

- 2024-11-05T12:30:58Z @tobiu added the `enhancement` label
- 2024-11-05T12:31:54Z @tobiu referenced in commit `5dd2f62` - "util.VDom: syncVdomIds() => map the vdom of direct children #6047"
- 2024-11-05T12:31:59Z @tobiu closed this issue
- 2024-11-05T13:43:51Z @tobiu assigned to @tobiu
- 2024-11-08T13:09:14Z @tobiu referenced in commit `3e31cb0` - "util.VDom: syncVdomIds() => map the vdom of direct children #6047"

