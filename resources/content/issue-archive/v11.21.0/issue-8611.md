---
id: 8611
title: Update DeltaUpdates.moveNode to support Fragments
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T18:41:34Z'
updatedAt: '2026-01-13T19:04:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8611'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T19:03:25Z'
---
# Update DeltaUpdates.moveNode to support Fragments

Update `Neo.main.DeltaUpdates.moveNode` to correctly resolve parent and sibling nodes when the target is a `Neo.container.Fragment`.

**Changes:**
1.  Check if `parentNode` is null (indicating a logical parent like a Fragment).
2.  If null, use `getFragmentStart(parentId)` to find the anchor.
3.  Resolve `parentNode` from the anchor.
4.  Resolve `siblingRef` using `getFragmentSibling(startNode, index)`.
5.  Proceed with existing `insertBefore` logic (preserving the "HOT-SWAP" optimization).

This depends on #8609 (Helper methods).

## Timeline

- 2026-01-13T18:41:35Z @tobiu added the `enhancement` label
- 2026-01-13T18:41:36Z @tobiu added the `ai` label
- 2026-01-13T18:41:36Z @tobiu added the `core` label
- 2026-01-13T19:02:42Z @tobiu referenced in commit `2b991c8` - "feat: Update DeltaUpdates.moveNode to support Fragments (#8611)"
### @tobiu - 2026-01-13T19:03:07Z

**Input from Gemini 3 Pro:**

> ✦ Updated `moveNode` to correctly resolve Fragment parents using the new helper methods. Verified logic with `FragmentDomMove.spec.mjs` (direct DeltaUpdates verification). E2E testing (`FragmentLifecycle`) is still timing out and will be addressed separately.

- 2026-01-13T19:03:26Z @tobiu closed this issue
- 2026-01-13T19:04:33Z @tobiu assigned to @tobiu
- 2026-01-13T19:04:40Z @tobiu added parent issue #8601

