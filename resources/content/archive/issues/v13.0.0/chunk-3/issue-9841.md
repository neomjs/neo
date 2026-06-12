---
id: 9841
title: 'Multi-Body: Peer State Adoption for Cell Selection Synchronization'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-09T21:30:35Z'
updatedAt: '2026-04-09T21:40:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9841'
author: tobiu
commentsCount: 1
parentIssue: 9492
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T21:40:27Z'
---
# Multi-Body: Peer State Adoption for Cell Selection Synchronization

## Architectural Context
In the Multi-Body Grid layout, single cell selection via `CellModel` (`items`) faces unique topological isolation. 
A single logical cell index (e.g., `row3__firstName`) only exists inside *one* specific `GridBody` component (e.g. `bodyEnd`), unlike rows or columns which span across multiple bodies conceptually.
However, visual correctness and keyboard navigation spanning across multi-view boundaries dictates that the logical pointer (`items_` state inherited from `Neo.selection.Model`) *must* be shared perfectly across all body models. 

## Objective
Harmonize `CellModel` state via the "Peer State Adoption" architecture to allow seamless keyboard routing across Grid Body interfaces.

## Implementation Details
1. **Event Binding Security:** `CellModel` must securely ignore `cellClick` event captures triggering outside its native `.view` node.
2. **Array Reference Adoption:** `Neo.selection.Model` configures `items_: { cloneOnGet: 'none' }`. We must utilize active Peer State sharing to bridge the array reference (`me._items = peers[0]._items`) across grid partitions, defeating the reactivity cloner, to merge arrow key navigations transparently.
3. **Visual Synchronization:** `CellModel.deselectAll()` blindly removes CSS classes if they intersect the active array. We must ensure state mutations in one physical partition update peers seamlessly (or ensure `selection.Model` does not crash looking up disconnected node graphs in remote bodies).

## Avoided Pitfalls
- Do NOT duplicate cell indexes in isolated array scopes. It destroys horizontal arrow key mapping.
- Be extremely careful hooking into the `_items` configuration from `Base.mjs` reactive setters to avoid destroying single-thread garbage collection.


## Timeline

- 2026-04-09T21:30:36Z @tobiu added the `enhancement` label
- 2026-04-09T21:30:37Z @tobiu added the `ai` label
- 2026-04-09T21:30:56Z @tobiu added parent issue #9492
- 2026-04-09T21:40:01Z @tobiu referenced in commit `6f42674` - "feat: cell selection models proxy multi-body grid container (#9841)"
- 2026-04-09T21:40:12Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T21:40:26Z

Implementation complete via 6f42674. CellModel now delegates properly using Peer State Adoption and active peer synchronization overrides across selection workflows (select/deselect/deselectAll).

- 2026-04-09T21:40:27Z @tobiu closed this issue

