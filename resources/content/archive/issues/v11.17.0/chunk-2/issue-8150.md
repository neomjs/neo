---
id: 8150
title: 'Regression: Monaco Editor double-initialization error'
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2025-12-20T00:04:24Z'
updatedAt: '2025-12-20T00:31:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8150'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-20T00:31:42Z'
---
# Regression: Monaco Editor double-initialization error

**Symptom:**
After the recent architecture changes (#8149), the Monaco Editor wrapper started throwing:
`Error: Element already has context attribute: neo-monaco-editor...`
This indicates `monaco.editor.create(node, ...)` is being called twice on the same DOM element.

**Immediate Fix:**
Made `Neo.main.addon.MonacoEditor.createInstance` idempotent by adding a check:
```javascript
if (me.map[id]) {
    return
}
```
This prevents the crash but masks the underlying issue.

**Root Cause Investigation Needed:**
We need to determine **why** `createInstance` is being invoked multiple times.
*   **Hypothesis 1:** The `processCachedMethodCalls` mechanism in `Neo.main.addon.Base` might be replaying a call that was *also* executed live (race condition).
*   **Hypothesis 2:** The wrapper component (`src/component/wrapper/MonacoEditor.mjs`) might be sending the message twice (e.g., `afterSetMounted` triggering multiple times).
*   **Hypothesis 3:** The new `windowId` routing logic might be delivering the same message twice (unlikely but possible).

This ticket tracks the regression fix and the subsequent investigation.


## Timeline

- 2025-12-20T00:04:25Z @tobiu added the `bug` label
- 2025-12-20T00:04:25Z @tobiu added the `ai` label
- 2025-12-20T00:04:25Z @tobiu added the `regression` label
- 2025-12-20T00:05:23Z @tobiu assigned to @tobiu
- 2025-12-20T00:05:48Z @tobiu referenced in commit `c91c725` - "#8150 quick fix"
- 2025-12-20T00:31:32Z @tobiu referenced in commit `b493b62` - "#8150 component.wrapper.MonacoEditor: afterSetWindowId() => clearing out main thread instances"
- 2025-12-20T00:31:43Z @tobiu closed this issue

