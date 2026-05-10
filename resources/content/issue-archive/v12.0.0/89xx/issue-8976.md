---
id: 8976
title: Fix Grid Cell Animations During Column Reordering
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-02-04T00:13:31Z'
updatedAt: '2026-02-04T00:19:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8976'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T00:19:18Z'
---
# Fix Grid Cell Animations During Column Reordering

The Grid Column Reordering functionality (`SortZone`) has partially regressed following the introduction of `Neo.grid.Row` components. While the header items still animate correctly, the corresponding column cells in the grid body no longer sync with these movements.

**Observed Regressions:**
1.  **Missing "Hide Original" Behavior:** When dragging a header, the original column cells should be hidden (or opacity reduced) to indicate they are being moved. This currently fails.
2.  **Missing Cell Slide Animation:** In the `dev` branch, when a header item is dragged and other headers slide to accommodate it, the corresponding cells in the grid body also slide horizontally to match the new column positions. In the `feature` branch, the cells remain static until the drop operation completes.

**Root Cause:**
The `SortZone` logic (and potentially `Grid.Body` logic) likely relies on manipulating the deep VDOM of the grid body directly (e.g., finding all cells for a column index and adjusting their `left` style). With `Neo.grid.Row` components, the `Grid.Body`'s VDOM contains component placeholders, not the deep cell structure. The logic attempting to animate these cells is failing to "reach through" the component boundary or is targeting the wrong VDOM nodes.

**Goal:**
-   Restore the "Hide Original" behavior for cells during drag start.
-   Restore the live "Slide Animation" for cells during the drag operation to sync with header movements.
-   Refactor `SortZone` (or `Grid.Body`) methods to correctly target and update `Row` component states or VDOM to reflect these temporary positional changes.

## Timeline

- 2026-02-04T00:13:31Z @tobiu added the `bug` label
- 2026-02-04T00:13:32Z @tobiu added the `ai` label
- 2026-02-04T00:13:32Z @tobiu added the `regression` label
- 2026-02-04T00:13:41Z @tobiu added parent issue #8964
- 2026-02-04T00:14:07Z @tobiu assigned to @tobiu
- 2026-02-04T00:18:51Z @tobiu referenced in commit `7c039bd` - "fix: Restore Grid Cell Animations During Column Reordering (#8976)"
### @tobiu - 2026-02-04T00:18:59Z

**Input from Gemini 3 Pro:**

> ✦ Restored cell animations and "Hide Original" behavior during drag operations.
> 
> **Fix:**
> - Updated `onDragStart` and `switchItems` in `SortZone.mjs` to force a deep update (`body.updateDepth = -1`) when modifying cell styles.
> - This ensures that style changes applied to disjoint `Row` components (visibility, position) are correctly collected and transmitted to the VDOM worker, syncing the grid body with the header drag proxy animations.

- 2026-02-04T00:19:18Z @tobiu closed this issue

