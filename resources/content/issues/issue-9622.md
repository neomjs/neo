---
id: 9622
title: 'Grid Multi-Body: Resolve duplicate cell rendering and phantom nodes'
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-04-01T19:56:28Z'
updatedAt: '2026-04-01T21:41:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9622'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-01T21:41:42Z'
---
# Grid Multi-Body: Resolve duplicate cell rendering and phantom nodes

### Problem
With the new Grid Multi-Body architecture, cells (`GridRow`) were suffering from massive duplication, generating O(TotalColumns) DOM nodes for every row regardless of their assigned sub-grid container. 

This occurred because `src/grid/Row.mjs` was retrieving its column configuration array (`mountedColumns`) correctly from its localized `columnPositions`, but indexed those positions directly into the **global** `gridContainer.columns` collection.

For instance, the `bodyEnd` sub-grid processing `[0, 0]` would query `globalColumns.getAt(0)`, forcefully rendering the `locked: 'start'` `activity` field in its own body and triggering missing event listener target errors (`target node not found: neo-sparkline-78__wrapper`).

### Solution
1. Rewired `GridRow` logic across all rendering passes (pooling and permanent cells) to safely extract the contextual `dataField` from the localized `columnPositions`.
2. Extracted the true column reference via `columns.get(columnPosition.dataField)` mapping.
3. This completely bounds column generation strictly to the explicit assignment rules for each respective sub-grid section (Start, Center, End).

## Timeline

- 2026-04-01T19:56:29Z @tobiu added the `bug` label
- 2026-04-01T19:56:29Z @tobiu added the `ai` label
- 2026-04-01T19:56:29Z @tobiu added the `grid` label
- 2026-04-01T19:56:36Z @tobiu added parent issue #9486
- 2026-04-01T19:57:13Z @tobiu referenced in commit `f099d05` - "fix: Prevent redundant Grid cell duplication in locked sub-bodies (#9622)

GridRow cells were mistakenly iterating through the global gridContainer.columns instead of bounding their iteration strictly to their localized columnPositions map. This caused sub-grids (like the End body) to iterate and render cells structurally belonging to completely different locked regions, causing critical phantom DOM node warnings and breaking VDOM performance."
- 2026-04-01T21:41:38Z @tobiu assigned to @tobiu
- 2026-04-01T21:41:42Z @tobiu closed this issue

