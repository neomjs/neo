---
id: 9839
title: 'Multi-Body: Peer State Adoption for Row Selection Synchronization'
state: CLOSED
labels: []
assignees:
  - tobiu
createdAt: '2026-04-09T21:18:41Z'
updatedAt: '2026-04-09T21:20:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9839'
author: tobiu
commentsCount: 1
parentIssue: 9492
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T21:20:06Z'
---
# Multi-Body: Peer State Adoption for Row Selection Synchronization

### Context
Phase 6 of the Multi-Body Epic (#9486) involves adapting Selection Models for Split Rows. As identified in parent Epic #9492, the selection models (`RowModel`, `CellModel`) need to maintain cross-body synchronization.

Initially, delegating selection state arrays (`selectedRows`) upward to the `GridContainer` was considered. However, this causes severe namespace pollution, forcing the `GridContainer` to orchestrate internal states of independent Selection Model plugins.

### Architecture: Peer State Adoption

To maintain encapsulation, we will implement the **Peer State Adoption** pattern in `Neo.selection.grid.BaseModel` and `RowModel`:

1.  **Zero GridContainer Pollution:** The state arrays remain strictly inside the Selection Models.
2.  **Shared State Reference:** During `register()`, a Selection Model will inspect its `GridContainer` for already instantiated sibling SMs. If a peer exists (e.g., `body.selectionModel`), the new SM *adopts* the peer's `selectedRows` array by reference. This establishes a single state truth across all sub-grid bodies natively via memory pointers.
3.  **Cross-Body VDOM Sync:** `RowModel` will bind to `gridContainer` DOM events. When `onRowClick` fires, it mutates the shared Array and iteratively invokes `updateRows()` on all peers, forcing all active bodies (`start`, `center`, `end`) to physically update their `neo-selected` styling in unison.

### Implementation Steps
1. Refactor `Neo.selection.grid.BaseModel` to adopt peer arrays.
2. Refactor `Neo.selection.grid.RowModel` to sync logical VDOM mutations.

## Timeline

- 2026-04-09T21:18:48Z @tobiu added parent issue #9492
- 2026-04-09T21:19:46Z @tobiu referenced in commit `1161a17` - "feat: Implement Peer State Adoption for Grid Multi-Body Row Selection (#9839)"
- 2026-04-09T21:19:51Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T21:19:59Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Closed via commit 1161a17ae.
> 
> **Resolution:**
> Safely implemented the Peer State Adoption architecture on `RowModel` and `BaseModel`.
> - The `Neo.selection.grid.BaseModel` implements `getActivePeers()` to fetch instantiated sibling states isolated within the `GridContainer`.
> - `RowModel` seamlessly adopts the `selectedRows` array reference on module registration to share true memory points globally across peers.
> - Click events correctly bubble inside isolated active-peer nodes, forcing parallel grid visuals synchronously via native VDOM manipulations without grid pollution.

- 2026-04-09T21:20:06Z @tobiu closed this issue

