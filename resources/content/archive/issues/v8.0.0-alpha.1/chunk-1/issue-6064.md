---
id: 6064
title: 'util.VNode: getChildIds() => exclude component references'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-05T23:58:58Z'
updatedAt: '2024-11-06T00:01:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6064'
author: tobiu
commentsCount: 0
parentIssue: 6045
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-06T00:01:38Z'
---
# util.VNode: getChildIds() => exclude component references

our use cases are to check affected components inside vnode trees (e.g. after an update cycle). for this, we do want to exclude not directly present child components.

## Timeline

- 2024-11-05T23:58:58Z @tobiu added the `enhancement` label
- 2024-11-05T23:58:58Z @tobiu assigned to @tobiu
- 2024-11-06T00:01:12Z @tobiu referenced in commit `8561658` - "util.VNode: getChildIds() => exclude component references #6064"
- 2024-11-06T00:01:39Z @tobiu closed this issue
- 2024-11-08T13:09:16Z @tobiu referenced in commit `d0e54cc` - "util.VNode: getChildIds() => exclude component references #6064"

