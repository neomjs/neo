---
id: 8020
title: 'Enhance container.SortZone for Complex Layouts (reopened from #7207)'
state: CLOSED
labels:
  - enhancement
  - no auto close
assignees: []
createdAt: '2025-12-04T02:59:32Z'
updatedAt: '2026-06-23T04:35:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8020'
author: github-actions
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
closedAt: '2026-06-23T04:35:04Z'
---
# Enhance container.SortZone for Complex Layouts (reopened from #7207)

Originally: #7207

## Goal
To refactor and enhance `Neo.draggable.container.SortZone` to support more complex drag-and-drop scenarios, such as dragging a component via a child handle. This will make the base class more generic, powerful, and reusable, significantly reducing the need for complex overrides in subclasses like `DashboardSortZone`.

## Tasks

1.  **Add `dragHandleSelector` Config:**
    -   In `src/draggable/container/SortZone.mjs`, introduce a new configuration property: `dragHandleSelector`.
    -   **Type:** `String`
    -   **Default:** `null`
    -   **Purpose:** This selector will identify a child element within a sortable item that serves as its drag handle.

2.  **Refactor `onDragStart`:**
    -   Modify the `onDragStart` method to incorporate the new `dragHandleSelector`.
    -   If `dragHandleSelector` is set, the logic must:
        -   Verify the drag was initiated on an element matching the selector.
        -   Identify the parent component that owns the handle as the actual item to be dragged.
        -   Implicitly filter the owner's items to only consider components containing a `dragHandleSelector` element as sortable. All internal logic (e.g., creating `itemRects`) should operate on this filtered list.
    -   If `dragHandleSelector` is `null`, the method must fall back to its original behavior to ensure backward compatibility.

3.  **Ensure Method Compatibility:**
    -   Review and adjust other methods (`onDragEnd`, `switchItems`, `updateItem`) to ensure they correctly handle the filtered list of sortable items and the associated index mappings.

## Acceptance Criteria
- When `dragHandleSelector` is configured on a `SortZone`, dragging an element matching the selector initiates a drag operation for its parent component.
- Items within the `SortZone`'s owner that do not contain an element matching the `dragHandleSelector` are not considered sortable and are ignored by the drag-drop logic.
- The `DashboardSortZone` can be refactored into a minimal subclass that primarily just configures the `dragHandleSelector`.
- Existing functionalities that use `container.SortZone` (e.g., tab header reordering) remain unaffected and work as before.

## Timeline

- 2025-12-04T02:59:32Z @github-actions added the `enhancement` label
- 2025-12-04T02:59:33Z @github-actions added the `stale` label
- 2025-12-04T02:59:33Z @github-actions cross-referenced by #7207
- 2025-12-04T03:00:01Z @tobiu removed the `stale` label
- 2025-12-04T03:00:01Z @tobiu added the `no auto close` label
### @neo-gpt - 2026-06-23T04:35:04Z

[TRIAGE_COMPLETED]

Fresh pass against current source shows this stale-bot reopen is already resolved in the codebase for its concrete implementation scope:

- `src/draggable/container/SortZone.mjs` already exposes `dragHandleSelector` with the default `null` contract.
- `SortZone#onDragStart()` already gates on the handle, resolves the owning parent component, filters sortable items to those containing the handle, and falls back to the original behavior when the selector is not configured.
- `src/draggable/dashboard/SortZone.mjs` already configures `dragHandleSelector: '.neo-draggable'`.
- Unit coverage exists in `test/playwright/unit/draggable/container/SortZone.spec.mjs` for mixed sortable/non-sortable content with `dragHandleSelector`.
- The original #7207 commit trail is present in git history: `61692a53c3`, `6f2a206521`, `2e26e1f6a5`.

The remaining AC wording, "DashboardSortZone can be refactored into a minimal subclass", is not a valid current target. `DashboardSortZone` now owns dashboard-specific DragCoordinator / remote-window / terminal-window-drop behavior, and `learn/agentos/HarnessDockZoneModel.md` keeps that split explicit: base/dashboard SortZones keep drag lifecycle and reorder math; DragCoordinator keeps cross-window arbitration; DockZoneModel records the accepted semantic workspace shape after a drop.

So I am closing this as completed rather than opening fresh work from the stale wording. Any future docking work should route through the #13158 / dock-zone model line, not through broadening this old #8020 prescription.


