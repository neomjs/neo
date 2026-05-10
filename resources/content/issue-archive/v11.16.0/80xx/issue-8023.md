---
id: 8023
title: Component.show() updateDepth fix
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-04T13:56:57Z'
updatedAt: '2025-12-04T13:57:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8023'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-04T13:57:38Z'
---
# Component.show() updateDepth fix

Changed `src/component/Base.mjs` `show()` method to set `updateDepth` to `-1` instead of `2`.

**Rationale:**
When re-showing bigger component trees, we need to ensure the full tree is updated, not just 1 child level. This was causing buggy behavior in the Colors app and the new AgentOS app, particularly when closing popup windows to re-integrate widgets.

**Change:**
```javascript
// src/component/Base.mjs
show() {
    // ...
    if (me.parentId !== 'document.body') {
        me.parent.updateDepth = -1; // Changed from 2
        me.parent.update()
    }
    // ...
}
```

## Timeline

- 2025-12-04T13:56:58Z @tobiu added the `bug` label
- 2025-12-04T13:56:59Z @tobiu added the `ai` label
- 2025-12-04T13:57:10Z @tobiu assigned to @tobiu
- 2025-12-04T13:57:38Z @tobiu closed this issue

