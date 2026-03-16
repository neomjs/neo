---
id: 9487
title: 'Grid Multi-Body: Refactor Layout Engine & SubGrid Partitioning'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T18:15:11Z'
updatedAt: '2026-03-16T18:18:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9487'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Refactor Layout Engine & SubGrid Partitioning

This is the first implementation phase for the V2 Multi-Body architecture described in Epic #9486.

Before we can render locked columns smoothly, we must physically partition the Grid's layout engine. Currently, `Neo.grid.Container` passes a single, flat `columnPositions` array to a singleton `Neo.grid.Body`.

**Requirements:**
1. **Column Partitioning:** Refactor the math engine inside `grid.header.Toolbar#passSizeToBody()` (or wherever the logical sizes are calculated). Instead of generating one flat array of physical `x` coordinates and widths, it must group them by their `locked` state:
    - `startColumns`: Array of `{dataField, width, x}` for columns where `locked: 'start'`. The `x` coordinates here start at `0`.
    - `centerColumns`: Array of `{dataField, width, x}` for unlocked columns. The `x` coordinates here *also* start at `0` (because they will live in their own physical container).
    - `endColumns`: Array of `{dataField, width, x}` for columns where `locked: 'end'`. `x` starts at `0`.

2. **SubGrid Instantiation (The Wrapper):**
    - The `grid.Container` needs a new internal structural layer inside its `body` configuration to hold up to three instances of `Neo.grid.Body`.
    - Example DOM target:
      ```html
      <div class="neo-grid-body-wrapper" style="overflow-y: auto;">
          <div class="neo-multi-body-layout" style="display: flex;">
              <div class="neo-body-start">...</div>
              <div class="neo-body-center">...</div>
              <div class="neo-body-end">...</div>
          </div>
      </div>
      ```

3. **Routing Configuration:**
    - The `grid.Container` must route the partitioned column definitions to their respective `grid.Body` instances. 

*Note: This ticket is strictly about layout calculation and instantiating the sub-containers. Fixing the vertical scroll math and row pooling for these bodies will be handled in subsequent tickets.*

## Timeline

- 2026-03-16T18:15:13Z @tobiu added the `enhancement` label
- 2026-03-16T18:15:13Z @tobiu added the `ai` label
- 2026-03-16T18:15:13Z @tobiu added the `grid` label
- 2026-03-16T18:15:26Z @tobiu added parent issue #9486
- 2026-03-16T18:18:37Z @tobiu assigned to @tobiu

