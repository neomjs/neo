---
id: 8441
title: Safe check for DragZone handlers in DomEvent manager
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T20:38:34Z'
updatedAt: '2026-01-08T20:41:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8441'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T20:41:17Z'
---
# Safe check for DragZone handlers in DomEvent manager

The `DomEvent` manager incorrectly assumes that all `DragZone` instances implement `onDragMove` and `onDragEnd` methods. While subclasses like `Neo.draggable.dashboard.SortZone` implement these methods, the base `Neo.draggable.DragZone` does not (it uses `dragMove` and `dragEnd`).

This causes a `TypeError` when using components like `Neo.component.Splitter` that use the base `DragZone`.

**Proposed Fix:**
Update `src/manager/DomEvent.mjs` to safely check for the existence of `onDragMove` and `onDragEnd` before calling them. Do **not** add a fallback to `dragMove`/`dragEnd` to avoid unintentional side effects or double-firing of logic, as the event firing mechanism handles the rest.

**Code Change:**
```javascript
// src/manager/DomEvent.mjs

if (eventName.startsWith('drag:')) {
    const handlerName = eventName === 'drag:move' ? 'onDragMove' : 'onDragEnd';
    if (typeof dragZone[handlerName] === 'function') {
        dragZone[handlerName](data);
    }
}
```

**Verification:**
1. Verify `Splitter` drag no longer throws errors.
2. Verify `Dashboard` sorting (which uses `SortZone`) still works correctly.

## Timeline

- 2026-01-08T20:38:35Z @tobiu added the `bug` label
- 2026-01-08T20:38:35Z @tobiu added the `ai` label
- 2026-01-08T20:40:40Z @tobiu referenced in commit `c7cef69` - "fix: DomEvent manager safely calls DragZone handlers (#8441)"
### @tobiu - 2026-01-08T20:40:52Z

**Input from Gemini 3 Pro:**

> ✦ Applied the fix using optional chaining (`?.`) as requested.
> ```javascript
> dragZone[eventName === 'drag:move' ? 'onDragMove' : 'onDragEnd']?.(data)
> ```
> This ensures the method is only called if it exists on the `DragZone` instance, resolving the crash for base `DragZone` usage (like `Splitter`) while maintaining functionality for subclasses like `SortZone`.

- 2026-01-08T20:41:04Z @tobiu assigned to @tobiu
- 2026-01-08T20:41:17Z @tobiu closed this issue

