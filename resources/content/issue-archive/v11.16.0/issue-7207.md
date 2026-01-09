---
id: 7207
title: Enhance container.SortZone for Complex Layouts
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2025-08-21T09:12:52Z'
updatedAt: '2025-12-04T02:59:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7207'
author: tobiu
commentsCount: 3
parentIssue: 7201
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-04T02:59:31Z'
---
# Enhance container.SortZone for Complex Layouts

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

## Comments

### @github-actions - 2025-11-20 02:50

This issue is stale because it has been open for 90 days with no activity.

### @github-actions - 2025-12-04 02:57

This issue was closed because it has been inactive for 14 days since being marked as stale.

### @github-actions - 2025-12-04 02:59

❌ Tickets cannot be reopened. Created new ticket: #8020

## Activity Log

- 2025-08-21 @tobiu assigned to @tobiu
- 2025-08-21 @tobiu added the `enhancement` label
- 2025-08-21 @tobiu added parent issue #7201
- 2025-08-21 @tobiu referenced in commit `61692a5` - "#7207 dragHandleSelector config"
- 2025-08-21 @tobiu referenced in commit `6f2a206` - "#7207 wip"
- 2025-08-21 @tobiu referenced in commit `2e26e1f` - "#7207"
- 2025-11-20 @github-actions added the `stale` label
- 2025-12-04 @github-actions closed this issue
- 2025-12-04 @github-actions closed this issue
- 2025-12-04 @github-actions cross-referenced by #8020

