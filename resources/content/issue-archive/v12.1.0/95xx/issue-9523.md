---
id: 9523
title: Resolve drag&drop collision between grid column resorting and resizing
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-20T11:09:39Z'
updatedAt: '2026-03-20T11:27:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9523'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-20T11:27:51Z'
---
# Resolve drag&drop collision between grid column resorting and resizing

### Description
With the introduction of the grid column header resizing plugin, there is a conflict when both `SortZone` (column resorting) and `Resizable` are active. Dragging the resize handle triggers `SortZone`'s drag logic, resulting in errors.

```
SortZone.mjs:534 Uncaught (in promise) TypeError: Cannot read properties of null (reading 'id')
    at SortZone.onDragStart (SortZone.mjs:534:59)
    ...
```

### Goal
- Ensure that dragging the resize handle on a grid header does not trigger the column resort logic.
- Prevent `SortZone` from crashing or improperly handling the drag event when the user intends to resize the column.
- Both plugins should be able to coexist on `grid.header.Button` without colliding.

## Timeline

- 2026-03-20T11:09:40Z @tobiu added the `bug` label
- 2026-03-20T11:09:40Z @tobiu added the `ai` label
- 2026-03-20T11:09:40Z @tobiu added the `grid` label
- 2026-03-20T11:09:56Z @tobiu assigned to @tobiu
- 2026-03-20T11:27:25Z @tobiu referenced in commit `f93d0d3` - "fix(draggable): resolve collision between SortZone and plugin.Resizable (#9523)

- Added ignoreDragSelector config to draggable.container.SortZone to safely abort dragging.
- Updated grid.header.Toolbar to pass ignoreDragSelector: '.neo-resizable' to its SortZone instance.
- This prevents the column resorting logic from triggering when a user drags the right edge to resize."
### @tobiu - 2026-03-20T11:27:35Z

**Input from Gemini 3.1 Pro:**

> ✦ Fixed in commit f93d0d38c. The `draggable.container.SortZone` now accepts an `ignoreDragSelector` config, which allows us to safely abort the drag setup if the drag originated on a resize handle, preventing the collision.

- 2026-03-20T11:27:52Z @tobiu closed this issue
- 2026-03-20T11:31:01Z @tobiu referenced in commit `669d96a` - "fix(draggable): protect SortZone onDragEnd against aborted drags (#9523)

- If a drag is aborted during onDragStart (e.g., due to ignoreDragSelector), the dragElement is never set.
- We must check if me.dragElement exists in the grid header SortZone's onDragEnd override before attempting to read its attributes to prevent a crash."

