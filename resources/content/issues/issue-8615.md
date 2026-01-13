---
id: 8615
title: Refactor Container to support atomic component moves
state: OPEN
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T19:49:44Z'
updatedAt: '2026-01-13T19:59:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8615'
author: tobiu
commentsCount: 0
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor Container to support atomic component moves

Currently, `Neo.worker.App.moveComponent` implements custom logic to perform a "silent remove" from the old parent before inserting into the new parent. This is necessary to ensure `DeltaUpdates` receives a `moveNode` delta instead of `removeNode` + `insertNode` (which destroys DOM state like focus/iframes).

This logic should be moved into `Neo.container.Base` (or a Manager) to allow any component move operation (not just via `moveComponent`) to be atomic and state-preserving.

**Goals:**
- Enhance `Neo.container.Base` to support moving items from another container.
- Implement `moveTo(newParent, index)` or enhance `add/insert` to detect existing parent and handle transition.
- Ensure VDOM updates generate `moveNode` delta where possible.

## Timeline

- 2026-01-13T19:49:45Z @tobiu added the `ai` label
- 2026-01-13T19:49:45Z @tobiu added the `refactoring` label
- 2026-01-13T19:49:45Z @tobiu added the `core` label
- 2026-01-13T19:49:58Z @tobiu added parent issue #8601
- 2026-01-13T19:59:05Z @tobiu assigned to @tobiu

