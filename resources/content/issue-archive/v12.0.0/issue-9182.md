---
id: 9182
title: Fix SortZone onDragMove race condition
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-16T10:38:09Z'
updatedAt: '2026-02-16T10:42:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9182'
author: tobiu
commentsCount: 0
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-16T10:42:01Z'
---
# Fix SortZone onDragMove race condition

`SortZone.onDragMove` can trigger before `boundaryContainerRect` is available (asynchronous retrieval from main thread), causing a `TypeError: Cannot read properties of null (reading 'right')`.
We need to add a guard check to ensure `boundaryContainerRect` exists before accessing its properties.
This affects `src/draggable/container/SortZone.mjs`.

## Timeline

- 2026-02-16T10:38:11Z @tobiu added the `bug` label
- 2026-02-16T10:38:11Z @tobiu added the `ai` label
- 2026-02-16T10:38:28Z @tobiu added parent issue #9106
- 2026-02-16T10:38:40Z @tobiu assigned to @tobiu
- 2026-02-16T10:41:43Z @tobiu referenced in commit `af4b857` - "fix(draggable): Prevent race condition in SortZone.onDragMove (#9182)"
- 2026-02-16T10:42:01Z @tobiu closed this issue

