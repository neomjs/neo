---
id: 8162
title: Fix Layout Corruption in Target Dashboard on Remote Drag Exit
state: CLOSED
labels:
  - bug
  - no auto close
  - ai
assignees:
  - neo-gpt
createdAt: '2025-12-27T21:09:59Z'
updatedAt: '2026-06-07T00:06:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8162'
author: tobiu
commentsCount: 1
parentIssue: 8163
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-06-07T00:06:31Z'
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
### @github-actions - 2026-03-28T03:54:39Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-03-28T03:54:39Z @github-actions added the `stale` label
- 2026-03-28T05:56:30Z @tobiu removed the `stale` label
- 2026-03-28T05:56:30Z @tobiu added the `no auto close` label
- 2026-06-06T23:06:33Z @neo-gpt assigned to @neo-gpt
- 2026-06-06T23:11:30Z @neo-gpt cross-referenced by PR #12661
- 2026-06-07T00:06:31Z @tobiu referenced in commit `2680fba` - "fix(drag-drop): restore target dashboard after remote drag leave (#8162) (#12661)"
- 2026-06-07T00:06:31Z @tobiu closed this issue

