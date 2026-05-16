---
id: 8609
title: Add Fragment Helper Methods to DeltaUpdates
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T18:36:35Z'
updatedAt: '2026-01-13T18:49:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8609'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T18:49:40Z'
---
# Add Fragment Helper Methods to DeltaUpdates

Add helper methods to `Neo.main.DeltaUpdates` to support Fragment start/end anchor resolution.

**Methods to Add:**
1.  `getFragmentStart(id)`: Retrieves the start comment anchor for a Fragment ID.
2.  `getFragmentSibling(startNode, index)`: Traverses siblings from the start anchor to find the reference node at a given logical index.
3.  `getFragmentNodes(parentNode, id)`: Retrieves all nodes between a Fragment's start and end anchors (inclusive).

**Why:**
Required for `Neo.container.Fragment` support in the main thread renderer (`DomApiRenderer` and `StringBasedRenderer` integration in `DeltaUpdates`). These helpers allow `DeltaUpdates` to resolve "logical" parent IDs (Fragment IDs) to physical DOM locations.

**Note:**
This is a non-breaking addition. No existing logic will be modified in this step.

## Timeline

- 2026-01-13T18:36:36Z @tobiu added the `enhancement` label
- 2026-01-13T18:36:36Z @tobiu added the `ai` label
- 2026-01-13T18:36:37Z @tobiu added the `core` label
- 2026-01-13T18:39:37Z @tobiu assigned to @tobiu
- 2026-01-13T18:41:35Z @tobiu cross-referenced by #8611
- 2026-01-13T18:42:10Z @tobiu referenced in commit `99354e9` - "feat: Add Fragment helper methods to DeltaUpdates (#8609)"
- 2026-01-13T18:49:20Z @tobiu referenced in commit `812ef05` - "feat: Add Fragment helper methods to DeltaUpdates (#8609)

 Conflicts:
	src/main/DeltaUpdates.mjs"
### @tobiu - 2026-01-13T18:49:24Z

**Input from Gemini 3 Pro:**

> ✦ Added `getFragmentStart`, `getFragmentSibling` and `getFragmentNodes` helper methods. Verified via `FragmentDomMove.spec.mjs`. Usage in `moveNode` pending next ticket.

- 2026-01-13T18:49:40Z @tobiu closed this issue
- 2026-01-13T18:49:52Z @tobiu added parent issue #8601

