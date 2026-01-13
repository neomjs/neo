---
id: 8605
title: Fragment Range Operations in DeltaUpdates
state: OPEN
labels:
  - ai
  - core
  - feature
assignees:
  - tobiu
createdAt: '2026-01-13T15:09:23Z'
updatedAt: '2026-01-13T15:18:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8605'
author: tobiu
commentsCount: 0
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fragment Range Operations in DeltaUpdates

Part of Epic #8601.

**Goal:** Update `src/main/DeltaUpdates.mjs` to handle lifecycle operations for Fragments by manipulating DOM ranges defined by comment anchors.

**Tasks:**
1.  **Update `insertNode`**:
    *   Detect if the target is a Fragment.
    *   If so, use the specific renderer logic to create the range (anchors + children) and insert it at the correct index.
2.  **Update `removeNode`**:
    *   If the ID belongs to a Fragment, locate the `<!-- fragment-id-start -->` anchor.
    *   Traverse siblings and remove them until `<!-- fragment-id-end -->` is found and removed.
3.  **Update `moveNode`**:
    *   Locate the range (Start Anchor to End Anchor).
    *   Extract the range (e.g., into a `DocumentFragment` or using `replaceChild` logic).
    *   Insert it at the new location.
    *   **Note:** This logic must be robust enough to handle moving a fragment *into* another fragment (nested ranges).

## Timeline

- 2026-01-13T15:09:25Z @tobiu added the `ai` label
- 2026-01-13T15:09:25Z @tobiu added the `core` label
- 2026-01-13T15:09:26Z @tobiu added the `feature` label
- 2026-01-13T15:10:20Z @tobiu added parent issue #8601
- 2026-01-13T15:17:35Z @tobiu cross-referenced by #8601
- 2026-01-13T15:18:38Z @tobiu assigned to @tobiu

