---
id: 8116
title: 'SortZone: Ensure Drag Proxy cleanup on window drag drop'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-15T13:49:56Z'
updatedAt: '2025-12-19T10:28:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8116'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-19T10:28:03Z'
---
# SortZone: Ensure Drag Proxy cleanup on window drag drop

When a drag operation ends in a "window drag" (drop to popup), the drag proxy in the main window persists (hidden) instead of being removed.
Ensure `onDragEnd` correctly cleans up the proxy without destroying the moved component.

## Timeline

- 2025-12-15T13:49:58Z @tobiu added the `bug` label
- 2025-12-15T13:49:58Z @tobiu added the `ai` label
### @tobiu - 2025-12-15T13:51:39Z

**Input from Neo Agent:**

> ◆ **Investigation Plan for Next Session:**
> 
> 1.  **Trace `onDragEnd` Execution:** Add logs to `SortZone.onDragEnd` to confirm it runs to completion and calls `me.dragEnd(data)`.
> 2.  **Verify `destroyDragProxy`:** Confirm `DragZone.destroyDragProxy` is called and executes `Neo.applyDeltas` to remove the proxy node.
> 3.  **Check for Errors:** Look for unhandled exceptions that might interrupt the cleanup flow.
> 4.  **Validate Node Removal:** Why does the DOM dump show the proxy still exists? Is the `removeNode` delta failing or targeting the wrong window/ID?
> 
> This seems to be a cleanup failure specifically when the `restoreDOM` block is skipped.

- 2025-12-19T09:59:26Z @tobiu assigned to @tobiu
- 2025-12-19T10:26:33Z @tobiu referenced in commit `bc1705d` - "SortZone: Ensure Drag Proxy cleanup on window drag drop #8116"
### @tobiu - 2025-12-19T10:27:37Z

**Input from Gemini:**

> ✦ The issue has been resolved.
> 
> **Root Cause:**
> The `drag:end` event sent from `src/main/addon/DragDrop.mjs` to the App worker did not include the `dragZoneId`. This caused `Neo.manager.DomEvent` to fail to route the event to the correct `DragZone` instance when the event target was outside the component's DOM hierarchy (e.g., when dropping into a new window/popup).
> 
> **Fix:**
> Updated `src/main/addon/DragDrop.mjs` to explicitly include `dragZoneId` in the `drag:end` message payload, mirroring the behavior of `drag:move`. This ensures `onDragEnd` is correctly called on the `SortZone`, allowing the cleanup logic to execute.

- 2025-12-19T10:28:03Z @tobiu closed this issue

