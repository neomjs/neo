---
id: 8819
title: 'feat: Add hasParent and getDistance to ComponentManager'
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T00:21:48Z'
updatedAt: '2026-01-20T00:22:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8819'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T00:22:38Z'
---
# feat: Add hasParent and getDistance to ComponentManager

Porting useful helper methods from `feat/8814-race-condition` to the `dev` branch.

Added methods to `Neo.manager.Component`:
1. `hasParent(childId, parentId)`: Boolean check if a component is a descendant of another.
2. `getDistance(childId, parentId)`: Returns the generational distance (1-based) between child and parent.

## Timeline

- 2026-01-20T00:21:49Z @tobiu added the `enhancement` label
- 2026-01-20T00:21:49Z @tobiu added the `ai` label
- 2026-01-20T00:21:49Z @tobiu added the `core` label
- 2026-01-20T00:22:27Z @tobiu referenced in commit `f0b9ff8` - "feat: Add hasParent and getDistance to ComponentManager (#8819)"
- 2026-01-20T00:22:38Z @tobiu closed this issue
- 2026-01-20T00:22:47Z @tobiu assigned to @tobiu

