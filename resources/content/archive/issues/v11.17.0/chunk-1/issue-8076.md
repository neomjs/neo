---
id: 8076
title: Fix JS error in Calendar Week View drag&drop creation due to lazy records
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-10T10:28:06Z'
updatedAt: '2025-12-10T10:30:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8076'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-10T10:30:39Z'
---
# Fix JS error in Calendar Week View drag&drop creation due to lazy records

When creating a new event in the Calendar Week View via drag&drop, a JS error `TypeError: record.setSilent is not a function` occurs in `EventDragZone.mjs`.
This is caused by the `lazy records` implementation in `Neo.data.Store`. `store.add()` returns the plain data object, but `EventDragZone` expects a `Neo.data.Model` instance (which has `setSilent`).
The fix is to ensure `DragDrop.mjs` retrieves the fully instantiated record from the store before passing it to `EventDragZone`.

**Error:**
```
EventDragZone.mjs:243 Uncaught (in promise) TypeError: record.setSilent is not a function
    at EventDragZone.dragEnd (EventDragZone.mjs:243:16)
    at DragDrop.mjs:158:37
```

**Files:**
* `src/calendar/view/week/plugin/DragDrop.mjs`
* `src/calendar/view/week/EventDragZone.mjs`


## Timeline

- 2025-12-10T10:28:07Z @tobiu added the `bug` label
- 2025-12-10T10:28:08Z @tobiu added the `ai` label
- 2025-12-10T10:29:57Z @tobiu assigned to @tobiu
- 2025-12-10T10:30:25Z @tobiu referenced in commit `31ee331` - "Fix JS error in Calendar Week View drag&drop creation due to lazy records #8076"
- 2025-12-10T10:30:39Z @tobiu closed this issue

