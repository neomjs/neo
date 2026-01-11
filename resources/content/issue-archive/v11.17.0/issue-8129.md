---
id: 8129
title: 'Manager.mjs: Transform autoMount to delta update'
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-16T19:22:09Z'
updatedAt: '2025-12-16T19:28:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8129'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-16T19:28:29Z'
---
# Manager.mjs: Transform autoMount to delta update

To remove the "magic placeholder" hack for `autoMount` and unify the DOM update pipeline, `WorkerManager` will now intercept `autoMount` messages, construct a proper `insertNode` delta from the payload, and route it through the `updateVdom` event.

**Changes in `src/worker/Manager.mjs`:**
1.  Detect `data.data.autoMount`.
2.  Construct a `deltas` array containing a single `insertNode` delta using `parentIndex`, `parentId`, `vnode`, and `outerHTML` from the message.
3.  Assign this `deltas` array to the payload.
4.  Fire `updateVdom` instead of `automount`.

This effectively moves `autoMount` operations to the `updateQueue` in `Main`, paving the way for removing the legacy `writeQueue`.

## Timeline

- 2025-12-16T19:22:11Z @tobiu added the `refactoring` label
- 2025-12-16T19:22:11Z @tobiu added the `architecture` label
- 2025-12-16T19:22:26Z @tobiu assigned to @tobiu
- 2025-12-16T19:28:21Z @tobiu referenced in commit `f81d266` - "Manager.mjs: Transform autoMount to delta update #8129"
- 2025-12-16T19:28:25Z @tobiu added the `ai` label
- 2025-12-16T19:28:29Z @tobiu closed this issue

