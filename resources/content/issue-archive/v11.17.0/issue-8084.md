---
id: 8084
title: Optimize LivePreview and NeoExecutor container updates by merging remove and add
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-10T18:02:12Z'
updatedAt: '2025-12-10T18:03:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8084'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-10T18:03:12Z'
---
# Optimize LivePreview and NeoExecutor container updates by merging remove and add

Currently, `LivePreview.doRunSource` and `NeoExecutor.execute` call `container.removeAll()` followed by `container.add()`.
`removeAll()` triggers a VDOM update (Depth 1 or 2).
`add()` triggers another VDOM update (Depth -1).

This double update is inefficient.

**Fix:**
Change `container.removeAll()` to `container.removeAll(true, true)` in both files.
The second argument `silent=true` suppresses the update after removal.
The subsequent `add()` will trigger a full update that includes the cleared state and the new item, merging two updates into one.

## Timeline

- 2025-12-10T18:02:13Z @tobiu added the `enhancement` label
- 2025-12-10T18:02:13Z @tobiu added the `ai` label
- 2025-12-10T18:02:23Z @tobiu assigned to @tobiu
- 2025-12-10T18:03:03Z @tobiu referenced in commit `4020dd5` - "Optimize LivePreview and NeoExecutor container updates by merging remove and add #8084"
- 2025-12-10T18:03:12Z @tobiu closed this issue

