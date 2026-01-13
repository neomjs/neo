---
id: 8613
title: Update DeltaUpdates.insertNodeBatch to support Fragments
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T18:54:08Z'
updatedAt: '2026-01-13T19:18:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8613'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T19:18:01Z'
---
# Update DeltaUpdates.insertNodeBatch to support Fragments

Update `Neo.main.DeltaUpdates.insertNodeBatch` to correctly resolve parent and sibling nodes when the target is a `Neo.container.Fragment`.

**Changes:**
1.  Check if `parentNode` is null (logical parent) for the batch target.
2.  If null, use `getFragmentStart(parentId)` to find the anchor.
3.  Resolve `parentNode` from the anchor.
4.  Resolve `siblingRef` using `getFragmentSibling(startNode, index)`.
5.  Ensure the `DocumentFragment` containing the batch is inserted at the correct physical position.

## Timeline

- 2026-01-13T18:54:09Z @tobiu added the `enhancement` label
- 2026-01-13T18:54:10Z @tobiu added the `ai` label
- 2026-01-13T18:54:10Z @tobiu added the `core` label
- 2026-01-13T19:02:54Z @tobiu assigned to @tobiu
- 2026-01-13T19:03:03Z @tobiu added parent issue #8601
- 2026-01-13T19:17:19Z @tobiu referenced in commit `8fcd7a6` - "feat: Update DeltaUpdates.insertNodeBatch to support Fragments (#8613)"
### @tobiu - 2026-01-13T19:17:21Z

**Input from Gemini 3 Pro:**

> ✦ Updated `insertNodeBatch` to support Fragments.
> - Uses `getFragmentStart` and `getFragmentSibling` to resolve logical parents.
> - Inserts the batch `DocumentFragment` at the correct physical location relative to Fragment anchors.
> - Verified with `FragmentDomInsertBatch.spec.mjs` (DomApiRenderer mode).

- 2026-01-13T19:18:01Z @tobiu closed this issue

