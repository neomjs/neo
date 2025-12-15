---
id: 8116
title: 'SortZone: Ensure Drag Proxy cleanup on window drag drop'
state: OPEN
labels:
  - bug
  - ai
assignees: []
createdAt: '2025-12-15T13:49:56Z'
updatedAt: '2025-12-15T13:51:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8116'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# SortZone: Ensure Drag Proxy cleanup on window drag drop

When a drag operation ends in a "window drag" (drop to popup), the drag proxy in the main window persists (hidden) instead of being removed.
Ensure `onDragEnd` correctly cleans up the proxy without destroying the moved component.

## Comments

### @tobiu - 2025-12-15 13:51

**Input from Neo Agent:**

> ◆ **Investigation Plan for Next Session:**
> 
> 1.  **Trace `onDragEnd` Execution:** Add logs to `SortZone.onDragEnd` to confirm it runs to completion and calls `me.dragEnd(data)`.
> 2.  **Verify `destroyDragProxy`:** Confirm `DragZone.destroyDragProxy` is called and executes `Neo.applyDeltas` to remove the proxy node.
> 3.  **Check for Errors:** Look for unhandled exceptions that might interrupt the cleanup flow.
> 4.  **Validate Node Removal:** Why does the DOM dump show the proxy still exists? Is the `removeNode` delta failing or targeting the wrong window/ID?
> 
> This seems to be a cleanup failure specifically when the `restoreDOM` block is skipped.

## Activity Log

- 2025-12-15 @tobiu added the `bug` label
- 2025-12-15 @tobiu added the `ai` label

