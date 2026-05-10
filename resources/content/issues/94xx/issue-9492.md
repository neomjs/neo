---
id: 9492
title: 'Grid Multi-Body: Adapt Selection Models for Split Rows'
state: OPEN
labels:
  - enhancement
  - epic
  - ai
  - refactoring
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T18:21:54Z'
updatedAt: '2026-04-09T22:32:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9492'
author: tobiu
commentsCount: 2
parentIssue: 9486
subIssues:
  - '[x] 9839 Multi-Body: Peer State Adoption for Row Selection Synchronization'
  - '[x] 9840 Multi-Body: Peer State Adoption for Column Selection Synchronization'
  - '[x] 9841 Multi-Body: Peer State Adoption for Cell Selection Synchronization'
subIssuesCompleted: 3
subIssuesTotal: 3
blockedBy:
  - '[ ] 9868 R&D: Grid Multi-Body Selection Architecture Redesign'
blocking: []
---
# Grid Multi-Body: Adapt Selection Models for Split Rows

Phase 6 of the Multi-Body Epic (#9486).

The current Grid Selection Models (RowModel, CellModel, etc.) assume that a single logical "Row" is represented by a single physical DOM node inside a single `Neo.grid.Body`.

In the Multi-Body architecture, a single logical record is rendered as up to three separate physical `Neo.grid.Row` instances (one in the `start` body, one in `center`, one in `end`).

The Challenge:
If a user clicks a row in the "Left" (locked) body, the selection model must visually highlight the matching row in the "Center" and "Right" bodies to maintain the illusion of a single row. 

This issue specifically covers the Grid Selection Models themselves and their event delegation. Keyboard Navigation across bodies is complex enough to warrant its own sub-issue.

Requirements:

1. **Multi-Node Selection updates in `BaseModel.updateRows()`**: The abstract `updateRows` logic must be updated to find and apply the `.neo-selected` CSS class to *all* physical row/cell instances across *all active SubGrids* that match the selected `recordId` or cell coordinates.
2. **SubGrid Awareness**: The Selection Model must be aware of the new SubGrid architecture (knowing to check `view.lockedStartBody`, `view.centerBody`, etc. instead of just a single `view`).
3. **Event Delegation**: Cell and Row click events currently originate from a single `Body`. The orchestrating Grid `Container` must capture and normalize these events to feed into the Selection Model regardless of which SubGrid they originated from.
4. **Refactor existing models**: Ensure `RowModel`, `CellModel`, `ColumnModel`, and their combinations (`CellRowModel`, `CellColumnModel`, `CellColumnRowModel`) all correctly handle the split bodies.

## Timeline

- 2026-03-16T18:21:56Z @tobiu added the `enhancement` label
- 2026-03-16T18:21:57Z @tobiu added the `ai` label
- 2026-03-16T18:21:57Z @tobiu added the `refactoring` label
- 2026-03-16T18:21:57Z @tobiu added the `grid` label
- 2026-03-16T18:22:10Z @tobiu added parent issue #9486
- 2026-03-16T21:51:51Z @tobiu changed title from **Grid Multi-Body: Adapt Selection Models & Keyboard Nav for Split Rows** to **Grid Multi-Body: Adapt Selection Models for Split Rows**
- 2026-03-17T18:59:16Z @tobiu assigned to @tobiu
- 2026-04-09T21:18:31Z @tobiu added the `epic` label
- 2026-04-09T21:18:42Z @tobiu cross-referenced by #9839
- 2026-04-09T21:18:48Z @tobiu added sub-issue #9839
- 2026-04-09T21:30:49Z @tobiu added sub-issue #9840
- 2026-04-09T21:30:56Z @tobiu added sub-issue #9841
### @tobiu - 2026-04-09T21:40:33Z

Epic resolved. The Grid Multi-Body Selection abstraction natively supports cell, row, and column Peer State Adoption workflows without container pollution.

- 2026-04-09T21:40:35Z @tobiu closed this issue
- 2026-04-09T21:45:14Z @tobiu reopened this issue
### @tobiu - 2026-04-09T22:32:18Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ ## Handoff: Architectural Discovery on `DevIndex` Multi-Body Synchronization
> 
> A profound architectural discovery was made while debugging why `smProps.selectedRows.includes(recordId)` was failing during the E2E verification, while the cross-body row highlighting (`.neo-selected`) visually succeeded.
> 
> ### The App-Level State Collision (`DevIndex` Legacy)
> We identified that the `RowModel` synchronization logic correctly propagates to peers via `updateRows()`; however, during testing, the Center body's `selectedRows` array was persistently empty. This paradoxical behavior (visuals passing, structural state failing) was caused by a legacy configuration in the `DevIndex` application itself.
> 
> The `DevIndex` application's `Contributor.mjs` data model retained an `annotations: { selected: false }` definition. 
> 
> Inside `RowModel.mjs`, the toggle branch intercepts this logic before native DOM state mutation occurs:
> ```javascript
> if (me.hasAnnotations(record)) {
>     // If the record uses an `annotations` field, `selectedRows` is explicitly bypassed. 
>     me.updateAnnotations(record) 
> } else {
>     me.toggleRowSelection(recordId); // Mutates `selectedRows` array
> }
> ```
> Because the old `annotations: {selected: false}` was still active in the App Worker context, it bypassed the structural array completely! The reason all 3 bodies visibly highlighted the row was that modifying the record triggered the `Store`'s `recordChange` event. A store event implicitly instructs the `GridContainer` to re-render that specific record across *all* active `GridBody` components, intrinsically applying the `.neo-selected` styling directly from the schema parser loop.
> 
> **Fix Applied:** Removed the legacy `annotations` field mapping in `Contributor.mjs` so the `RowModel` properly falls back to `toggleRowSelection()`.
> 
> ### The Controller Defect in DevIndex
> Activating the `RowModel` dynamically via the DevIndex demo UI (and subsequently our Neural Link script `app.setProperties`) currently only updates `body.selectionModel`:
> ```javascript
> // apps/devindex/view/home/MainContainerController.mjs
> onSelectionModelChange(data) {
>     this.getReference('grid').body.selectionModel = data.component.selectionModel;
> }
> ```
> Because it does not actively clone and re-assign the Selection Model config to `bodyStart` and `bodyEnd`, those locking columns remain abandoned on their default (or prior) selection models.
> 
> As an immediate consequence, `getActivePeers()` successfully retrieves instantiated sibling instances, but they might be `CellModel` instances instead of identically aligned `RowModel`s! Because both models inherit `updateRows()` from `BaseModel`, it serendipitously accepts the DOM manipulation instructions; however, this is structurally fragile.
> 
> ### For the Next Agent (Wake-up Context)
> 1. **Controller Parity:** Proceed to update `apps/devindex/view/home/MainContainerController.mjs` to ensure dynamic Selection Model toggles reflect across all multi-body panes (`bodyStart`, `body`, `bodyEnd`).
> 2. **Playwright Reset:** Make sure Neural Link `app.setProperties` targets all active model layers in the test harness.
> 3. **Verify Dev Server Caching:** Rebuild or freshly serve the Dev Workspace so the deletion of the `annotations` field in `Contributor.mjs` correctly hits the browser without caching the obsolete App Worker chunk.
> 
> *Session saved internally to the Memory Core. Waiting for the final validation passes.*

- 2026-04-10T05:34:30Z @tobiu referenced in commit `4ad0f9b` - "chore: align Multi-Body Grid Row Selection & fix test harness (#9492)"
- 2026-04-10T16:22:28Z @tobiu cross-referenced by #9866
- 2026-04-10T16:22:54Z @tobiu cross-referenced by PR #9867
- 2026-04-10T16:35:10Z @tobiu cross-referenced by #9868
- 2026-04-10T16:35:22Z @tobiu marked this issue as being blocked by #9868

