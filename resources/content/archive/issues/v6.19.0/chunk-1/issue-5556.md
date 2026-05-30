---
id: 5556
title: 'vdom.Helper: insertOrMoveNode() => simplification'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-10T13:16:40Z'
updatedAt: '2024-07-10T14:20:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5556'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-10T14:20:45Z'
---
# vdom.Helper: insertOrMoveNode() => simplification

now that `insertOrMoveNode() ` will no longer get called for the same "real" index, we can remove parts of the internal logic.

## Timeline

- 2024-07-10T13:16:40Z @tobiu added the `enhancement` label
- 2024-07-10T13:16:41Z @tobiu assigned to @tobiu
- 2024-07-10T13:17:33Z @tobiu referenced in commit `c9cdd4f` - "vdom.Helper: insertOrMoveNode() => simplification #5556"
- 2024-07-10T13:27:53Z @tobiu referenced in commit `77bcbc6` - "#5556 vdom.Helper: insertOrMoveNode() => only update the local childNodes var in case the parentNode did change"
- 2024-07-10T14:20:45Z @tobiu closed this issue

