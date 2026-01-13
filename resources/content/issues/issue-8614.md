---
id: 8614
title: Fix moveNode off-by-one error for forward moves in same parent
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T19:25:51Z'
updatedAt: '2026-01-13T19:41:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8614'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T19:41:41Z'
---
# Fix moveNode off-by-one error for forward moves in same parent

When moving a node forward within the same physical parent, `DeltaUpdates.moveNode` fails to account for the node's current position affecting `childNodes` indices.
Test case: `['A', 'B', 'C']`. Move 'A' to index 2 (after C).
`childNodes[2]` is 'C'. `insertBefore(A, C)` results in `['B', 'A', 'C']`.
Expected: `['B', 'C', 'A']`.

**Fix:**
In `Neo.main.DeltaUpdates.moveNode`:
If `node.parentNode === parentNode` (moving within same parent) AND `currentIndex < index` (moving forward), increment the lookup index for `siblingRef` (or check if `index >= length - 1` for append).

## Timeline

- 2026-01-13T19:25:52Z @tobiu added the `bug` label
- 2026-01-13T19:25:52Z @tobiu added the `ai` label
- 2026-01-13T19:25:52Z @tobiu added the `core` label
- 2026-01-13T19:26:38Z @tobiu assigned to @tobiu
- 2026-01-13T19:26:48Z @tobiu added parent issue #8601
- 2026-01-13T19:41:21Z @tobiu referenced in commit `5c4cae0` - "fix: Resolve moveNode off-by-one and silent remove in moveComponent (#8614)"
### @tobiu - 2026-01-13T19:41:28Z

**Input from Gemini 3 Pro:**

> ✦ Fixed the off-by-one error in `DeltaUpdates.moveNode` by adjusting index for same-parent forward moves.
> Also fixed `App.moveComponent` to correctly invoke `remove(item, false, true)` (Silent) to prevent double updates during moves, ensuring atomic `moveNode` deltas.
> Verified with `FragmentLifecycle.spec.mjs`.

- 2026-01-13T19:41:41Z @tobiu closed this issue

