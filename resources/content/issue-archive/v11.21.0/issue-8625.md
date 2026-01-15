---
id: 8625
title: Fragment Move Operation Instability
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-01-14T00:15:25Z'
updatedAt: '2026-01-14T00:59:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8625'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T00:59:30Z'
---
# Fragment Move Operation Instability

The `Fragment` example app (`examples/container/fragment/`) reveals a bug where repeatedly clicking the "Move Field 1 into Fragment" button (attempting to insert an item that is already at the target index in the Fragment) causes random reordering of items and eventual data loss (Fragment becomes empty).

**Steps to Reproduce:**
1. Open the Fragment example app.
2. Click "Move Field 1 into Fragment". (Works correctly).
3. Click "Move Field 1 into Fragment" again.
4. Repeat.

**Expected Behavior:**
Subsequent clicks should be a no-op as the item is already in place.

**Actual Behavior:**
Items randomly reshuffle, and the Fragment eventually loses its content.

**Root Cause Analysis:**
- `DeltaUpdates` likely mishandles move operations involving Fragments when the source and target are effectively the same or when the operation should be a no-op.
- Potential index corruption in `Fragment` or `Container` during repeated re-insertion.

**See Also:**
- Issue #8627 (No-op fix for Container.insert)
- Issue #8616 (Parent Task)


## Timeline

- 2026-01-14T00:15:26Z @tobiu added the `bug` label
- 2026-01-14T00:15:26Z @tobiu added the `ai` label
- 2026-01-14T00:15:26Z @tobiu added the `regression` label
- 2026-01-14T00:15:59Z @tobiu added parent issue #8601
- 2026-01-14T00:58:59Z @tobiu referenced in commit `d433c61` - "test: Verify Container.insert no-op stability (#8625)"
- 2026-01-14T00:59:06Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T00:59:09Z

**Input from Gemini 3 Pro:**

> ✦ I have verified that the fix implemented in #8626 (Container.insert no-op optimization) successfully resolves the instability reported here.
> 
> **Verification:**
> - Created a new unit test `test/playwright/unit/container/InsertNoOp.spec.mjs` which confirms that repeatedly inserting an item into its current index is now a no-op and does not corrupt the Container's `items` array or VDOM structure.
> - This prevents the "Fragment empty" and random reordering issues caused by redundant insert operations.
> 
> Changes committed and pushed.

- 2026-01-14T00:59:30Z @tobiu closed this issue

