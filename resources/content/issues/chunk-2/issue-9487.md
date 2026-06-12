---
id: 9487
title: 'Grid Multi-Body: Refactor Layout Engine & SubGrid Partitioning'
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T18:15:11Z'
updatedAt: '2026-03-31T10:27:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9487'
author: tobiu
commentsCount: 1
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-31T10:27:00Z'
---
# Grid Multi-Body: Refactor Layout Engine & SubGrid Partitioning

Phase 2 of the Multi-Body Epic (#9486).

Before we can render locked columns smoothly, we must physically partition the Grid's layout engine. Currently, `Neo.grid.Container` passes a single, flat `columnPositions` array to a singleton `Neo.grid.Body`.

**Requirements:**

**1. Column Partitioning:** Refactor the math engine inside `grid.header.Toolbar#passSizeToBody()` (or wherever the logical sizes are calculated). Instead of generating one flat array of physical `x` coordinates and widths, it must group them by their `locked` state:
  * `startColumns`: Array of `{dataField, width, x}` for columns where `locked: 'start'`. The `x` coordinates here start at `0`.
  * `centerColumns`: Array of `{dataField, width, x}` for unlocked columns. The `x` coordinates here also start at `0` (because they will live in their own physical container).
  * `endColumns`: Array of `{dataField, width, x}` for columns where `locked: 'end'`. `x` starts at `0`.

**2. SubGrid Instantiation (The Wrapper):**
  * The `grid.Container` needs a new internal structural layer inside its body configuration to hold up to three instances of `Neo.grid.Body`.
  * Example DOM target:
    ```html
    <div class="neo-grid-body-wrapper" style="overflow-y: auto;">
        <div class="neo-multi-body-layout" style="display: flex;">
            <div class="neo-body-start">...</div>
            <div class="neo-body-center">...</div>
            <div class="neo-body-end">...</div>
        </div>
    </div>
    ```
  * **`removeDom: true` Optimization:** If a zone (e.g., Left) has no columns assigned to its collection, its corresponding SubGrid VDOM node should receive `removeDom: true` to keep the live DOM lightweight while preserving the component instance and VDOM structure.

**3. Routing Configuration:**
  * The `grid.Container` must route the partitioned column definitions to their respective `grid.Body` instances.

**4. Header Splitting:** 
   * Refactor `header.Toolbar.mjs` to be instantiated up to three times (one per zone), binding to the respective column collections defined in Phase 1.

Note: Fixing the vertical scroll math and row pooling for these bodies will be handled in subsequent tickets.

## Timeline

- 2026-03-16T18:15:13Z @tobiu added the `enhancement` label
- 2026-03-16T18:15:13Z @tobiu added the `ai` label
- 2026-03-16T18:15:13Z @tobiu added the `grid` label
- 2026-03-16T18:15:26Z @tobiu added parent issue #9486
- 2026-03-16T18:18:37Z @tobiu assigned to @tobiu
- 2026-03-31T10:02:56Z @tobiu cross-referenced by #9486
- 2026-03-31T10:26:38Z @tobiu referenced in commit `36b45d7` - "feat: Grid Multi-Body architecture layout wrappers and sub-grid partitioning (#9487)"
### @tobiu - 2026-03-31T10:26:47Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Completed Phase 2 of the Multi-Body Epic.
> 
> - Implemented `headerWrapper` and `bodyWrapper` inside `GridContainer.mjs` to encapsulate symmetrical sub-grids.
> - Created `createOrUpdateSubGrids()` logic for dynamic sub-grid orchestration based on split column collections.
> - Refactored `Toolbar.passSizeToBody()` to explicitly calculate constraints corresponding to its twin GridBody via the `layoutLock` config, correctly resetting `x: 0` coordinates.
> - Overhauled `onColumnLockChange()` and `onColumnsMutate()` for centralized state consistency resulting in automatic sub-grid regeneration boundaries.
> - Re-architected `Row.mjs` & `Body.mjs` dependency resolution to inherently rely on `_gridContainer` traversing up multi-tier structures cleanly.

- 2026-03-31T10:27:00Z @tobiu closed this issue
- 2026-03-31T10:33:31Z @tobiu cross-referenced by #9607

