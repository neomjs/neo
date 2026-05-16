---
id: 9840
title: 'Multi-Body: Peer State Adoption for Column Selection Synchronization'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-09T21:30:28Z'
updatedAt: '2026-04-09T21:40:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9840'
author: tobiu
commentsCount: 1
parentIssue: 9492
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T21:40:20Z'
---
# Multi-Body: Peer State Adoption for Column Selection Synchronization

## Architectural Context
The Neo.mjs Multi-Body Grid architecture partitions the DOM into segregated `bodyStart`, `body`, and `bodyEnd` components. 
Historically, `ColumnModel` relied on isolated states (`selectedColumns`). When clicking a cell, multiple bodies capture the bubbled `cellClick` event, resulting in race conditions or isolated states breaking cross-body column selection physics.

## Objective
Apply the same "Peer State Adoption" pattern deployed in `#9839` to `ColumnModel`.

## Implementation Details
1. **Event Binding Security:** `ColumnModel` binds to `gridContainer` (similar behavior to `RowModel`). It must immediately abort processing if `event.body !== view`.
2. **Peer State Adoption:** In `BaseModel.register()`, `selectedColumns` must be adopted natively from the first active, instantiated sibling peer to guarantee a single memory array instance.
3. **Visual Synchronization:** When a column is clicked and selection is toggled, it must map to `getActivePeers().forEach(peer => { peer.view.createViewData() })` (or equivalent method) to mutate and refresh column highlights across all split grid segments concurrently.

## Avoided Pitfalls
- Do NOT pollute the `GridContainer` namespace with state variables.
- We must decouple row and column selections into respective arrays without breaking the VDOM single-thread event loop mapping.


## Timeline

- 2026-04-09T21:30:29Z @tobiu added the `enhancement` label
- 2026-04-09T21:30:29Z @tobiu added the `ai` label
- 2026-04-09T21:30:49Z @tobiu added parent issue #9492
- 2026-04-09T21:40:01Z @tobiu referenced in commit `6e704c3` - "feat: column selection models proxy multi-body grid container (#9840)"
- 2026-04-09T21:40:07Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T21:40:20Z

Implementation complete via 6e704c3. Sibling visual arrays and BaseModel adoption logic implemented. The ColumnModel is fully decoupled from the GridContainer and independently synchronizes its visuals across active peers.

- 2026-04-09T21:40:21Z @tobiu closed this issue

