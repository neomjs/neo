---
id: 8596
title: Enhance VDOM ID Stability to Remove Manual ID Requirement in TreeList
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T13:11:16Z'
updatedAt: '2026-01-13T13:38:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8596'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T13:38:52Z'
---
# Enhance VDOM ID Stability to Remove Manual ID Requirement in TreeList

**Context:**
The recent fix for the TreeList "Chimera Bug" (#8595) involved manually assigning deterministic IDs to `UL` containers to prevent `Neo.util.VDom.syncVdomState` from erroneously assigning them IDs from sibling `LI` nodes during race conditions.

**Problem:**
While effective, this manual ID assignment feels like a workaround ("monkey patching"). The framework's core VDOM engine, specifically `Neo.util.VDom.syncVdomState` and `Neo.vdom.Helper`, should theoretically be robust enough to handle dynamic nodes without requiring manual IDs for every structural element. The goal of `ensureStableIds` and similar initiatives was to make this automatic.

**Objective:**
1.  Investigate why `syncVdomState` fails to distinguish between the `UL` container and the `LI` item when the `UL` appears dynamically.
2.  Create a focused reproduction case (unit test) that isolates `syncVdomState` behavior with dynamic sibling nodes where one lacks an ID.
3.  Implement a fix in `src/util/VDom.mjs` or `src/vdom/Helper.mjs` that makes the manual `UL` ID assignment in `TreeList` unnecessary.
4.  Verify the fix by removing the manual ID from `TreeList` and running the race condition tests.

**Goal:**
Ensure `Neo.tree.List` (and other components) works robustly with purely dynamic IDs for container elements.

## Timeline

- 2026-01-13T13:11:18Z @tobiu added the `bug` label
- 2026-01-13T13:11:18Z @tobiu added the `ai` label
- 2026-01-13T13:11:18Z @tobiu added the `core` label
- 2026-01-13T13:11:30Z @tobiu assigned to @tobiu
- 2026-01-13T13:35:03Z @tobiu referenced in commit `ff6dd1f` - "fix(vdom): Prevent Chimera VDOM corruption in syncVdomState (#8596)

- Abort ID sync if node tags mismatch to prevent container/item ID swaps during race conditions

- Revert manual ID assignment in TreeList

- Add unit test for VDOM state synchronization

- Fix missing VdomHelper import in SortZone test"
### @tobiu - 2026-01-13T13:36:43Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented a core VDOM fix for the Chimera Bug and reverted the manual workaround in `TreeList`.
> 
> **Changes:**
> 1.  **Core VDOM Fix (`src/util/VDom.mjs`):** Modified `syncVdomState` to abort ID synchronization if the node tags (`vnode.nodeName` vs `vdom.tag`) do not match. This prevents the "Chimera" scenario where a `UL` container (appearing dynamically) inherits the ID of a sibling `LI` item during a race condition.
> 2.  **TreeList Revert (`src/tree/List.mjs`):** Removed the manual ID assignment (`parentId + '__ul'`) introduced in the previous fix. The core VDOM engine now handles this safely.
> 3.  **New Unit Test (`test/playwright/unit/vdom/SyncVdomState.spec.mjs`):** Added a dedicated test suite for `syncVdomState` that explicitly reproduces the mismatched-tag scenario and asserts that IDs are NOT synced.
> 4.  **Test Fix (`test/playwright/unit/draggable/container/SortZone.spec.mjs`):** Fixed a flaky test failure by explicitly importing `VdomHelper`, which was previously relying on implicit global state from other tests.
> 
> **Verification:**
> - `npx playwright test test/playwright/unit/vdom/SyncVdomState.spec.mjs` ✅ Passed
> - `npx playwright test test/playwright/unit/tree/ListRaceCondition.spec.mjs` ✅ Passed (without manual IDs)
> - All unit tests passed locally.
> 
> The changes have been pushed to `dev`.

- 2026-01-13T13:37:44Z @tobiu cross-referenced by #8592
- 2026-01-13T13:38:53Z @tobiu closed this issue

