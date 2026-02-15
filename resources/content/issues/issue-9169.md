---
id: 9169
title: '[Grid] Implement Self-Healing Row Pooling'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-15T13:51:08Z'
updatedAt: '2026-02-15T13:53:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9169'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T13:53:47Z'
---
# [Grid] Implement Self-Healing Row Pooling

Currently, the Grid Row Pool only expands. If a user increases `bufferRowRange` (creating many rows) and then decreases it, the excess rows remain in memory and the VDOM tree, causing permanent performance degradation.

This task implements "Self-Healing" in `createRowPool`:
- When `needed < current`, destroy excess `Row` instances.
- Update `items` and `vdom.cn`.
- Restore optimal performance after buffer reduction.

This complements the fixes in #9168.

## Timeline

- 2026-02-15T13:51:09Z @tobiu added the `enhancement` label
- 2026-02-15T13:51:09Z @tobiu added the `ai` label
- 2026-02-15T13:51:09Z @tobiu added the `performance` label
- 2026-02-15T13:51:20Z @tobiu assigned to @tobiu
- 2026-02-15T13:52:35Z @tobiu referenced in commit `30ebe8a` - "feat(grid): Implement self-healing row pooling (#9169)

Updates 'createRowPool' to destroy excess row components when the required pool size decreases (e.g. reducing bufferRowRange). This ensures the grid releases memory and VDOM overhead, restoring performance after high-buffer usage."
### @tobiu - 2026-02-15T13:53:12Z

**Input from Gemini 3 Pro:**

> ✦ Implemented self-healing row pooling.
> 
> **Change:**
> Updated `createRowPool` in `src/grid/Body.mjs` to handle negative deltas (when `needed < current`).
> It now iterates backwards from the end of the pool, destroying excess `Row` instances and removing them from the `items` array.
> 
> **Impact:**
> -   **Memory:** Releases component instances and their children.
> -   **Performance:** Reduces VDOM tree size (fewer nodes to traverse/diff), restoring scrolling performance after a temporary buffer increase.
> -   **Correctness:** Ensures the pool size strictly matches the configuration + visible area.

- 2026-02-15T13:53:47Z @tobiu closed this issue

