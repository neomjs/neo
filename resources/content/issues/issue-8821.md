---
id: 8821
title: 'feat: Track in-flight descendants in VDomUpdate'
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T00:26:14Z'
updatedAt: '2026-01-20T03:48:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8821'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T03:48:20Z'
---
# feat: Track in-flight descendants in VDomUpdate

Implement a mechanism for children to inform parents of in-flight updates without parents walking down the tree.

1. Modify `VDomUpdate` to track `descendantInFlightMap`.
2. Update `registerInFlightUpdate` to walk up the tree (using `ComponentManager.getParentIds`) and register the update on ancestors.
3. Update `unregisterInFlightUpdate` to cleanup.
4. Add `getInFlightDescendants(ownerId)` method.

## Timeline

- 2026-01-20T00:26:15Z @tobiu added the `enhancement` label
- 2026-01-20T00:26:15Z @tobiu added the `ai` label
- 2026-01-20T00:26:15Z @tobiu added the `core` label
- 2026-01-20T03:48:18Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-20T03:48:20Z

already pushed

- 2026-01-20T03:48:20Z @tobiu closed this issue

