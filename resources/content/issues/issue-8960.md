---
id: 8960
title: 'Fix: Vertical scrolling causes OffscreenCanvas loss in Grid cells'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-03T12:36:23Z'
updatedAt: '2026-02-03T12:43:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8960'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T12:43:49Z'
---
# Fix: Vertical scrolling causes OffscreenCanvas loss in Grid cells

We are observing a glitch where vertically scrolling the grid can cause some OffscreenCanvas instances (like Sparklines) to be "lost" or appear blank.

**Analysis:**
This likely relates to the buffered row range mechanism in `Neo.grid.Body`. When rows are recycled or moved, the VDOM diffing engine might be generating `move` operations or destructive updates that interfere with the `OffscreenCanvas` persistence, similar to the horizontal scrolling issue but on the vertical axis.

**Investigation Plan:**
1.  Inspect `src/grid/Body.mjs` and its row recycling/buffering logic.
2.  Analyze VDOM deltas during vertical scrolling to identify if DOM nodes are being destroyed/recreated instead of moved/updated.
3.  Ensure that `canvas` elements within the recycled rows maintain their worker association.

**Goal:**
Ensure `OffscreenCanvas` instances remain stable and connected to their workers during vertical scrolling and row recycling.


## Timeline

- 2026-02-03T12:36:24Z @tobiu added the `bug` label
- 2026-02-03T12:36:24Z @tobiu added the `ai` label
- 2026-02-03T12:43:01Z @tobiu referenced in commit `71ba8ff` - "Fix: Vertical scrolling causes OffscreenCanvas loss in Grid cells (#8960)"
- 2026-02-03T12:43:12Z @tobiu added parent issue #8930
### @tobiu - 2026-02-03T12:43:28Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix for the vertical scrolling glitch where OffscreenCanvas instances were being lost.
> 
> **Root Cause:**
> The `mountedRows` logic in `src/grid/Body.mjs` was calculating the render window based strictly on `visible + buffer`. At the boundaries of the dataset (top and bottom), this window size was smaller than the `Recycle Modulus` (available rows + 2 * buffer).
> Because the number of rendered rows fluctuated (e.g., shrinking to 15 at the top vs 20 in the middle), the VDOM engine interpreted the re-appearance of the "spare" rows as **new insertions** (`insertNode`), which destroys the DOM node and the associated Worker connection.
> 
> **Fix Implemented:**
> Modified `updateMountedAndVisibleRows` to enforce a **Constant Window Size** equal to the Recycle Modulus.
> -   At the top of the grid, the window is "pushed down" to include look-ahead rows, filling the recycle pool.
> -   At the bottom, the window is "pulled up" to include look-behind rows.
> 
> **Outcome:**
> The set of Row IDs `{row-0 ... row-N}` now remains constant as long as the dataset is large enough. This ensures the VDOM engine always generates `moveNode` operations for row recycling, preserving the `OffscreenCanvas` contexts and eliminating the visual glitch during vertical scrolling.

- 2026-02-03T12:43:37Z @tobiu assigned to @tobiu
- 2026-02-03T12:43:50Z @tobiu closed this issue

