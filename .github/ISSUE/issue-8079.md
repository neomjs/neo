---
id: 8079
title: >-
  Fix VDOM update collision logic to correctly handle direct child updates
  (1-based depth)
state: OPEN
labels:
  - bug
  - ai
assignees: []
createdAt: '2025-12-10T13:45:43Z'
updatedAt: '2025-12-10T13:45:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8079'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fix VDOM update collision logic to correctly handle direct child updates (1-based depth)

The `hasUpdateCollision` check in `src/mixin/VdomLifecycle.mjs` incorrectly uses `<` for comparison (`distance < updateDepth`).
Since `updateDepth` is 1-based:
- `updateDepth: 1` targets the component itself (including child placeholders).
- A direct child is at `distance: 1`.
- Therefore, `1` (depth) vs `1` (distance) IS a collision.

The current logic returns `false` (`1 < 1`), causing concurrent updates (Parent Depth 1 vs Child Depth 1) to race, leading to the child's content being overwritten/ignored by the parent's placeholder update.

**Resolution:**
Change the logic in `src/mixin/VdomLifecycle.mjs` to `distance <= updateDepth`.
This ensures that `hasUpdateCollision(1, 1)` returns `true`, forcing the child to either merge into the parent (increasing parent depth to 2) or wait for the parent to finish (post-update).

## Activity Log

- 2025-12-10 @tobiu added the `bug` label
- 2025-12-10 @tobiu added the `ai` label

