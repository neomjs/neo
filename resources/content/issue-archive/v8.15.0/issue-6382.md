---
id: 6382
title: 'util.Rectangle: getIntersection() => return an intersection rectangle'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-05T15:53:05Z'
updatedAt: '2025-02-05T16:01:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6382'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-05T16:01:52Z'
---
# util.Rectangle: getIntersection() => return an intersection rectangle

* So far, the logic was only needed to check if the intersecting area was > 50% when dropping a dialog between 2 browser windows
* However, to use it inside `main.addon.DragDrop`, we do need the real intersection rect

## Timeline

- 2025-02-05T15:53:05Z @tobiu added the `enhancement` label
- 2025-02-05T15:53:06Z @tobiu assigned to @tobiu
- 2025-02-05T16:01:45Z @tobiu referenced in commit `74bd15b` - "util.Rectangle: getIntersection() => return an intersection rectangle #6382"
- 2025-02-05T16:01:53Z @tobiu closed this issue

