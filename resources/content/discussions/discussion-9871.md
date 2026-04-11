---
number: 9871
title: 'Architectural Ideation: Elevate Grid Selection Model to GridContainer'
author: tobiu
category: Ideas
createdAt: '2026-04-10T18:01:01Z'
updatedAt: '2026-04-10T18:18:15Z'
---
## The Concept
Migrate the `selectionModel` upwards from the `Neo.grid.Body` components to the `Neo.grid.Container`. Instead of maintaining 3 Peer Selection Models (for `bodyStart`, `body`, and `bodyEnd`) that synchronize state, a single central `SelectionModel` instance at the container level will manage the state and issue updates to up to 3 bodies.

## The Rationale
- **Simplicity:** Eliminates the fragile "Peer State Adoption" logic (e.g., sharing the `selectedRows` arrays across 3 distinct class instances).
- **Parallel Updates:** A single SM mutation can batch VDOM updates across all 3 bodies simultaneously, preventing split-second UI disconnects between frozen and center columns.
- **Event Delegation:** Currently, DOM events like `rowClick` delegate up to `GridContainer`. Having the SM on the Container naturally matches the event delegation phase, avoiding the current `if (event.body && event.body !== view) return` check in `RowModel.onRowClick`.

## Challenges & Open Questions (The Counter-Argument)
While moving the SM to the container solves state propagation, it creates a severe violation of component abstraction regarding VDOM mutation.

1. **The O(1) VDOM Mutation Problem (`updateRows()`):**
   Currently, `Neo.selection.grid.BaseModel.updateRows()` achieves O(1) performance by directly asking its `view` (the `GridBody`) for the specific row component: `row = view.getRow(record);`. It then mutates the VDOM class directly. 
   If the `view` becomes the `GridContainer`, the container does not hold row instances. The SM would be forced to hardcode multi-body layout awareness:
   ```javascript
   [view.bodyStart, view.body, view.bodyEnd].filter(Boolean).forEach(body => {
       let row = body.getRow(record);
       if (row) { /* mutate VDOM */ }
   });
   ```
   This tightly couples the abstract Selection Model to the physical layout of a Multi-Body Grid implementation.

2. **Standalone Grid Bodies:**
   If `Neo.grid.Body` is intended to be used autonomously without a `GridContainer`, moving the SM config to the container completely disables selection capabilities for lightweight, standalone lists.

3. **CellModel Logical IDs:**
   The `CellModel` uses logical IDs. If the `view` is the `GridContainer`, resolving a cell's coordinates requires querying downwards through all distinct bodies to find which actual DOM node matches the `dataField`, introducing runtime overhead during high-frequency cell mutations.

## Comments

### `@tobiu` commented on 2026-04-10T18:18:14Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ ### Architectural Conclusion: The \"3-Tier Orchestration\"
> 
> After evaluating this proposal, we determined that elevating the `selectionModel` to `GridContainer` introduces an unacceptable VDOM diff penalty, as it would unnecessarily trigger re-renders on the `headerToolbar`. 
> 
> Instead, the orchestration responsibility will be moved downwards to `Neo.grid.View` (body wrapper) and a new `Neo.grid.header.Wrapper`.
> 
> **The New Architecture:**
> 1. **`Neo.grid.Container` (Macro Layout):** Acts purely as layout coordinator. It passes `columns` and configs but stops manually instantiating sub-bodies into other containers.
> 2. **`Neo.grid.header.Wrapper` (New Class):** Dedicated container that orchestrates the `headerStart`, `headerToolbar`, and `headerEnd`.
> 3. **`Neo.grid.View` (Body Orchestrator & State Master):** 
>    - Owns the physical `bodyStart`, `body`, and `bodyEnd` components.
>    - **Owns the `selectionModel`.**
>    - **Owns `syncBodies()`** (moved from `GridContainer`).
>    - Implements a Facade for `getRow(record)` to proxy down to the specific bodies, thereby preserving O(1) mathematical isolation for the Selection Model.
> 
> By making `grid.View` the orchestrator, we solve the Peer State Adoption fragility, eliminate the VDOM header penalty, and restore the ability to use lists without headers (standalone `View`).

---

