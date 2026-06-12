---
id: 6840
title: 'vdom.VNode: normalizeClassName()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-18T20:53:29Z'
updatedAt: '2025-06-18T20:53:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6840'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-18T20:53:52Z'
---
# vdom.VNode: normalizeClassName()

* important: module based method, not class based
* VNodes get serialised to get passed via ´postMessage´, so there would be more iterations
* Negligible from a performance perspective, but the main argument is purity

## Timeline

- 2025-06-18T20:53:29Z @tobiu assigned to @tobiu
- 2025-06-18T20:53:30Z @tobiu added the `enhancement` label
- 2025-06-18T20:53:47Z @tobiu referenced in commit `76f15de` - "vdom.VNode: normalizeClassName() #6840"
- 2025-06-18T20:53:52Z @tobiu closed this issue
- 2025-06-18T20:56:21Z @tobiu referenced in commit `3f7684f` - "#6840 comment improvement"

