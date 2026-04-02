---
id: 9621
title: 'Grid Multi-Body: Fix Header Scrolling, Flex Layout, and Single-Column Constraints'
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees: []
createdAt: '2026-04-01T19:05:05Z'
updatedAt: '2026-04-01T19:11:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9621'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-01T19:11:09Z'
---
# Grid Multi-Body: Fix Header Scrolling, Flex Layout, and Single-Column Constraints

### Problem
In the Multi-Body Grid Architecture, several related bugs prevent proper viewing of locked headers and single-column sub-grids:
1. `GridBody.createViewData()` aborts early if `mountedColumns[1] < 1`. Single-column grids (like the locked-end DevIndex column) have a max index of 0, so they render 0 rows.
2. `Container.beforeSetHeaderToolbar()` gives `headerToolbar` (the center header) `flex: 'none'`. This causes it to expand infinitely based on inner buttons, pushing `headerEnd` out of the viewport.
3. `ScrollManager.updateGridHorizontalScrollSyncAddon()` applies horizontal scrolling to `headerWrapper` instead of `headerToolbar`, translating the entire header row out of view instead of just the center columns.
4. `Container.syncBodies()` incorrectly pushes horizontal `scrollLeft` to `bodyStart` and `bodyEnd`, causing them to incorrectly cull their columns because they falsely evaluate as being "off-screen".

### Implementation Plan
- **GridBody:** Fix culling threshold `mountedColumns[1] < 0`.
- **Container:** Apply `flex: 1` to `headerToolbar`.
- **Container.syncBodies:** Only apply `scrollLeft` to the center body.
- **ScrollManager:** Change `headerId` to target `headerToolbar`.

## Timeline

- 2026-04-01T19:05:07Z @tobiu added the `bug` label
- 2026-04-01T19:05:08Z @tobiu added the `ai` label
- 2026-04-01T19:05:08Z @tobiu added the `grid` label
- 2026-04-01T19:10:42Z @tobiu referenced in commit `7ae7771` - "fix(grid): multi-body header flex layout and subgrid single-column parsing (#9621)"
### @tobiu - 2026-04-01T19:11:08Z

Implemented and pushed to dev.

- 2026-04-01T19:11:09Z @tobiu closed this issue
- 2026-04-01T19:39:51Z @tobiu referenced in commit `ce5723f` - "feat: Stabilize multi-body component mounting and flex layouts (#9621)

- GridRowScrollPinning: Resolves content nodes dynamically during applyPinning to successfully support lazily-mounted sub-grids.
- header.Button: Applies flex: 'none' to protect fixed-width column items from shrinking within flex containers.
- header.Toolbar: Removes explicit vertical stretch to restore proper horizontal Flexbox default behavior."

