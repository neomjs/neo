---
id: 8977
title: Implement Surgical DOM Move for Component Columns in Drag Proxy
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-04T00:37:27Z'
updatedAt: '2026-02-04T01:07:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8977'
author: tobiu
commentsCount: 2
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T01:02:38Z'
---
# Implement Surgical DOM Move for Component Columns in Drag Proxy

For component-based columns (specifically heavy ones like `Sparkline` using OffscreenCanvas), cloning instances for the Drag Proxy is resource-intensive and complex.

**Optimization Strategy: Surgical Content Move**
Instead of creating new component instances, we will "borrow" the DOM content from the grid cells and temporarily move it into the drag proxy using `Neo.applyDeltas` (bypassing VDOM logic).

**The DOM Structure:**
```html
<!-- Grid Cell Container (Stays in Grid) -->
<div id="neo-grid-body-1__row-0__activity" ... class="neo-grid-cell" ...>
    <!-- Content Wrapper (Moves to Proxy) -->
    <div id="neo-sparkline-1__wrapper" class="neo-sparkline-wrapper">
        <canvas id="neo-sparkline-1" ...></canvas>
    </div>
</div>
```

**Implementation Plan:**
1.  **Drag Start (`createDragProxy`):**
    -   Identify component-based cells.
    -   Find the ID of the **first child** (Content Wrapper) of the cell.
    -   Use `Neo.applyDeltas` to `moveNode` this Content Wrapper into the corresponding cell container within the Drag Proxy.
    -   *Result:* The Grid Cell becomes empty (transparent placeholder), and the Proxy displays the *live* component (preserving state/canvas context).

2.  **During Drag:**
    -   Grid updates (e.g. column reordering animations) target the *Cell Container*. Since this container remains in the grid DOM, animations work normally.
    -   Component updates (e.g. data changes) target the *Content Wrapper* or *Canvas*. Since these IDs exist (in the proxy), updates still apply correctly.

3.  **Drag End (`onDrop`):**
    -   Use `Neo.applyDeltas` to `moveNode` the Content Wrapper back to its original Cell Container (`neo-grid-body-1__row-0__activity`).
    -   Ensure correct order if needed (appendChild).

**Benefits:**
-   **Zero instantiation cost:** No new contexts, no worker overhead.
-   **Perfect Fidelity:** Live canvas state is preserved.
-   **Robustness:** Decouples layout (Grid Cell) from content (Component), preventing VDOM interference with drag animations.

## Timeline

- 2026-02-04T00:37:28Z @tobiu added the `enhancement` label
- 2026-02-04T00:37:28Z @tobiu added the `ai` label
- 2026-02-04T00:37:28Z @tobiu added the `performance` label
- 2026-02-04T00:37:34Z @tobiu added parent issue #8964
- 2026-02-04T00:38:10Z @tobiu assigned to @tobiu
- 2026-02-04T00:53:54Z @tobiu referenced in commit `82de0df` - "fix: Inherit Grid CSS Classes in Drag Proxy (#8977)"
- 2026-02-04T00:58:46Z @tobiu referenced in commit `f3a591f` - "docs: Add Architecture Documentation to Grid SortZone (#8977)"
### @tobiu - 2026-02-04T01:02:01Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the "Surgical DOM Move" optimization for drag proxies.
> 
> **Changes:**
> - **Refactored `createDragProxy`:**
>     - Detects component-based cells (e.g. Sparklines).
>     - Uses `Neo.applyDeltas` to physically move the cell content (first child) into the proxy after it mounts.
>     - Inherits `grid.cls` to ensure custom app styling (e.g., `devrank-grid-container`) persists in the proxy.
> - **Updated `onDragEnd`:**
>     - Restores moved components to their original grid cells before destroying the proxy.
> - **Enhanced Documentation:**
>     - Added comprehensive JSDoc explaining the "Surgical DOM Move" and "Disjoint Updates" patterns in `SortZone.mjs`.
> 
> **Result:**
> Drag operations for heavy components like `OffscreenCanvas` are now performant (no re-instantiation) and visually perfect (live state preserved).

- 2026-02-04T01:02:38Z @tobiu closed this issue
### @tobiu - 2026-02-04T01:07:35Z

resolved.


