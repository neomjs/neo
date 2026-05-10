---
id: 8135
title: Ensure Neo.applyDeltas handles single delta objects
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2025-12-17T02:45:20Z'
updatedAt: '2025-12-17T02:47:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8135'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-17T02:47:26Z'
---
# Ensure Neo.applyDeltas handles single delta objects

`Neo.applyDeltas` allows passing a delta object or an array of deltas. However, `Neo.worker.Manager.handleDomUpdate` explicitly checks `deltas?.length > 0` to determine if it should process the update or just send a reply.

If a single object is passed to `applyDeltas` (e.g., `{id: 'foo', cls: {add: ['bar']}}`), `deltas.length` is undefined, causing the check to fail and the update to be silently ignored. This issue was identified in `src/calendar/view/month/Component.mjs`.

**Goal:**
Make `Neo.applyDeltas` robust by ensuring the `deltas` payload sent to the main thread is always an array.

**Task:**
Modify `src/worker/App.mjs`:
*   Update `applyDeltas(windowId, deltas)` to check if `deltas` is an array.
*   If not, wrap it in an array: `deltas = Array.isArray(deltas) ? deltas : [deltas];`.

This ensures compatibility with the `Manager`'s logic and supports the convenient single-object syntax used throughout the codebase.

## Timeline

- 2025-12-17T02:45:21Z @tobiu added the `bug` label
- 2025-12-17T02:45:21Z @tobiu added the `ai` label
- 2025-12-17T02:45:21Z @tobiu added the `core` label
- 2025-12-17T02:46:19Z @tobiu assigned to @tobiu
- 2025-12-17T02:47:00Z @tobiu referenced in commit `49637b5` - "Ensure Neo.applyDeltas handles single delta objects (#8135)"
- 2025-12-17T02:47:26Z @tobiu closed this issue

