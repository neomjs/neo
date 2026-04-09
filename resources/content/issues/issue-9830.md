---
id: 9830
title: Synchronize Multi-Body Selection State in GridContainer
state: OPEN
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-04-09T17:06:21Z'
updatedAt: '2026-04-09T17:06:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9830'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Synchronize Multi-Body Selection State in GridContainer

### Context
During the testing of the Grid Multi-Body architecture via Neural Link E2E capabilities, we discovered a core architectural synchronization failure in `Neo.selection.grid.RowModel`.

In a standard single-body Grid layout, the Selection Model successfully listens to DOM events such as `rowClick` bindings via `me.view.parent.on('rowClick', me.onRowClick, me)`, where `me.view.parent` typically represents the overarching orchestrator.

### The Problem
When the grid splits into multiple bodies (`bodyStart`, `bodyCenter`, `bodyEnd`), and we instantiate them using `Neo.grid.View` wrappers:
1. `GridBody.parent` explicitly resolves to `Neo.grid.View` (configured by `parentId: me.view.id`).
2. When a row is clicked inside `body`, the internal event fires `me.gridContainer.fire(eventName, ...)` directly natively targeting the Container. 
3. However, `RowModel` does not listen to `gridContainer`. It stays rigidly bound to its parent wrapper (`Neo.grid.View`). 
4. The `GridView` wrapper component does not natively trap or bubble the `rowClick` event. 

Because of this paradigm disconnect, the `RowModel` across sub-grids fails to detect row clicks, leaving the selection state (`selectedRows`) out of sync preventing rows from highlighting globally.

### Proposed Architecture Fix
1. Refactor `Neo.selection.grid.RowModel` to bind to `me.view.gridContainer || me.view.parent` so it natively captures the bubbling `rowClick` fired directly by `GridBody`.
2. Evaluate if state arrays such as `selectedRows` should be delegated upward to the `GridContainer` levels so all 3 instantiated RowModels reflect single state truth.

## Timeline

- 2026-04-09T17:06:22Z @tobiu added the `bug` label
- 2026-04-09T17:06:22Z @tobiu added the `ai` label
- 2026-04-09T17:06:23Z @tobiu added the `grid` label
- 2026-04-09T17:06:27Z @tobiu assigned to @tobiu
- 2026-04-09T17:06:35Z @tobiu referenced in commit `74a5abc` - "test: Sync E2E logic to Neural Link selection API #9830"

