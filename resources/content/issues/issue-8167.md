---
id: 8167
title: Harden Return Trip Logic for Detached Items
state: OPEN
labels:
  - bug
  - QA
  - ai
assignees:
  - tobiu
createdAt: '2025-12-27T21:33:28Z'
updatedAt: '2026-01-01T17:04:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8167'
author: tobiu
commentsCount: 0
parentIssue: 8163
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Harden Return Trip Logic for Detached Items

**Scenario:**
1. User drags item from Window A (Source).
2. Item becomes a Popup (Window C).
3. User drags Popup over Window B (Target). Proxy appears in B.
4. User changes mind and drags back to Window A.

**Risks:**
*   Does Window A recognize the item as its own returning child (via `detachedItems` map)?
*   Does it create a duplicate?
*   Is the state (internal component data) preserved through the round trip?

**Goal:**
Audit and harden this flow. Ensure `onDragBoundaryEntry` in the Source correctly identifies the returning item and restores it to its original state/placeholder without data loss or ID conflicts.

## Timeline

- 2025-12-27T21:33:29Z @tobiu added the `bug` label
- 2025-12-27T21:33:29Z @tobiu added the `QA` label
- 2025-12-27T21:33:29Z @tobiu added the `ai` label
- 2025-12-27T21:33:52Z @tobiu added parent issue #8163
- 2026-01-01T17:04:47Z @tobiu assigned to @tobiu

