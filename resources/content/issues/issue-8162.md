---
id: 8162
title: Fix Layout Corruption in Target Dashboard on Remote Drag Exit
state: OPEN
labels:
  - bug
  - ai
assignees: []
createdAt: '2025-12-27T21:09:59Z'
updatedAt: '2025-12-27T21:09:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8162'
author: tobiu
commentsCount: 0
parentIssue: 8163
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fix Layout Corruption in Target Dashboard on Remote Drag Exit

When a remote drag (originating from Window A) enters a Target Dashboard (Window B) and then leaves it (back to void/popup), the Target Dashboard layout appears broken (users report "all panel bodies removed" or a sizing mess).

**Scenario:**
1. Drag item from Window A -> Window B (Target).
2. Proxy and Placeholder appear in Window B.
3. Drag item OUT of Window B (into void).
4. Window A resumes popup (Correct).
5. Window B layout is corrupted (Incorrect).

**Hypothesis:**
`SortZone.onDragEnd` (triggered via `onRemoteDragLeave`) might be failing to correctly restore the state of the target items. Possible causes:
*   `itemStyles` captured during `startRemoteDrag` might be incorrect if the layout was already shifting.
*   `visibility` or dimensions set during the drag are not being reset properly.
*   VDOM/DOM synchronization issues upon placeholder removal.

**Goal:**
Debug and fix the layout restoration logic in `SortZone` to ensure the Target Dashboard returns to its pristine state when a remote drag visitor leaves.

## Timeline

- 2025-12-27T21:10:00Z @tobiu added the `bug` label
- 2025-12-27T21:10:00Z @tobiu added the `ai` label
- 2025-12-27T21:33:44Z @tobiu added parent issue #8163

