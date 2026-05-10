---
id: 8823
title: 'test: Investigate RealWorldUpdates Regression'
state: CLOSED
labels:
  - bug
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-01-20T03:25:35Z'
updatedAt: '2026-01-20T11:08:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8823'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T11:08:54Z'
---
# test: Investigate RealWorldUpdates Regression

The recent VDOM race condition fixes (Ticket #8814) introduced a regression in `test/playwright/unit/vdom/RealWorldUpdates.spec.mjs`.

**Symptoms:**
- Tests fail with `0` or `1` delta received instead of expected `2`.
- Specifically, child updates are not being merged into the parent update or are being serialized such that `promiseUpdate()` only captures the parent's delta.

**Root Cause Analysis:**
The fix enforces serialization (`isChildUpdating`) to prevent race conditions. `RealWorldUpdates.spec.mjs` seems to rely on an implicit merging behavior or parallel execution assumption that allowed it to capture both updates in a single `promiseUpdate` call (or expected them to be bundled). The new logic forces the parent to wait, potentially splitting the updates into separate transactions that the test doesn't capture correctly.

**Action Item:**
Investigate if `RealWorldUpdates.spec.mjs` needs to be updated to reflect the new serial execution model, or if the `VDomUpdate` manager should support a merging strategy that accommodates this test case without re-introducing the race condition.
Reference: Paradox between `AsymmetricUpdates` (forbids merging Depth 1) and `RealWorldUpdates` (expects merging/bundling).

## Timeline

- 2026-01-20T03:25:36Z @tobiu added the `bug` label
- 2026-01-20T03:25:36Z @tobiu added the `ai` label
- 2026-01-20T03:25:36Z @tobiu added the `testing` label
- 2026-01-20T03:55:30Z @tobiu assigned to @tobiu
- 2026-01-20T11:07:45Z @tobiu referenced in commit `fc1bd2d` - "test: Fix RealWorldUpdates regression via test logic and add VdomMerging test (#8823)"
### @tobiu - 2026-01-20T11:08:06Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved the regression in `RealWorldUpdates.spec.mjs`.
> 
> **Root Cause:**
> The test relied on `parent.setSilent` to bundle parent and child updates. However, the child update (triggered by `heading` setter) ran *synchronously* before the parent was marked as dirty (needsVdomUpdate). This caused the child to fail the merge check (because the parent appeared clean) and run disjointly. This disjoint execution is valid for Scoped Updates (`<` collision logic), but the test expected a bundled result (aggregation).
> 
> **Solution:**
> 1.  **Refactored Test Logic:** Updated `RealWorldUpdates.spec.mjs` to ensure the parent is explicitly dirty (e.g., via a `style` change) *before* the child update is triggered. This is achieved by ordering the properties in `setSilent` (`{style: ..., heading: ...}`).
> 2.  **Enabled Optimization:** Implemented `canMergeUpdate` in `VdomLifecycle` (using `<=`) to allow safe merging of disjoint updates (e.g., Parent Depth 1 + Child Depth 1) when the parent is already updating.
> 3.  **Added Regression Test:** Created `test/playwright/unit/vdom/VdomMerging.spec.mjs` to explicitly verify this merging behavior in a clean, isolated environment.
> 
> All tests are now passing (8/8 in RealWorldUpdates, 1/1 in VdomMerging). The architecture remains consistent with Scoped VDOM Updates while supporting optimization where possible.

- 2026-01-20T11:08:54Z @tobiu closed this issue
- 2026-01-20T11:21:57Z @tobiu cross-referenced by #8826

