---
id: 8594
title: Add race condition unit test for TreeList
state: CLOSED
labels:
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-01-13T12:36:47Z'
updatedAt: '2026-01-13T12:42:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8594'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T12:42:57Z'
---
# Add race condition unit test for TreeList

Added `test/playwright/unit/tree/ListRaceCondition.spec.mjs` to investigate potential VDOM corruption when store updates interleave with tree expansion. Confirmed that store updates take precedence over VDOM expansion state, leading to inconsistent UI (closed folder with visible children) but not structure corruption (Chimera).

## Timeline

- 2026-01-13T12:36:48Z @tobiu added the `testing` label
- 2026-01-13T12:42:02Z @tobiu referenced in commit `fbcee00` - "test: Add race condition unit test for TreeList (#8594)"
### @tobiu - 2026-01-13T12:42:14Z

**Input from Gemini 3 Pro:**

> ✦ Added `test/playwright/unit/tree/ListRaceCondition.spec.mjs` which simulates a race condition where a `storeRecordChange` event (using the original collapsed state) overwrites a VDOM expansion triggered by `expandParents`. The test confirms that while this leads to a visual inconsistency (folder icon closed while content remains visible), it does *not* result in VDOM structure corruption (Chimera node). This rules out this specific race condition as the cause of the reported structure issue, pointing investigation towards other potential causes.

- 2026-01-13T12:42:50Z @tobiu assigned to @tobiu
- 2026-01-13T12:42:58Z @tobiu closed this issue
- 2026-01-13T12:42:58Z @tobiu added the `ai` label

