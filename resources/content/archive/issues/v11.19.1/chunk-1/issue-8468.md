---
id: 8468
title: Fix Unit Test Failures after VDOM ID Stabilization
state: CLOSED
labels:
  - bug
  - ai
  - testing
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T14:02:55Z'
updatedAt: '2026-01-09T15:12:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8468'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T15:12:08Z'
---
# Fix Unit Test Failures after VDOM ID Stabilization

After implementing the stable VDOM ID fix (Issue #8465), several unit tests are failing. The failures are likely due to tests assuming auto-generated IDs (`neo-vnode-X`) which are now being replaced by stable wrapper IDs (`neo-component-X__wrapper`), or real regressions.

**Failing Tests:**
- `test/playwright/unit/draggable/container/SortZone.spec.mjs`
- `test/playwright/unit/manager/domEvent/Fire.spec.mjs`
- `test/playwright/unit/vdom/RealWorldUpdates.spec.mjs`

**Goal:**
Investigate and fix the failing tests. If the failures are due to the test assumptions, update the tests. If they reveal a regression, fix the code.


## Timeline

- 2026-01-09T14:02:56Z @tobiu added the `bug` label
- 2026-01-09T14:02:57Z @tobiu added the `ai` label
- 2026-01-09T14:02:57Z @tobiu added the `testing` label
- 2026-01-09T14:02:57Z @tobiu added the `core` label
- 2026-01-09T15:11:04Z @tobiu referenced in commit `4d623c1` - "fix: ensure stable VDOM IDs are assigned in mergeConfig to resolve event registration timing (#8468)"
- 2026-01-09T15:11:35Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T15:11:49Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved the unit test failures by adjusting the initialization timing of stable VDOM IDs.
> 
> ### **Root Cause**
> The `Fire.spec.mjs` test failures (event bubbling) revealed a timing issue. `DomEvent` listeners are registered during `initConfig` (via `domListeners` config). At this stage, the component's `_vdom` object had not yet received its stable ID (which was previously assigned in `onConstructed`). This caused listeners to be registered with an `undefined` `vnodeId`, breaking the event delegation logic.
> 
> ### **Resolution**
> Moved the `ensureStableIds()` call from `onConstructed` to `mergeConfig` in `src/component/Base.mjs`.
> - `mergeConfig` creates the instance-specific `_vdom` clone.
> - By calling `ensureStableIds()` immediately after cloning, we guarantee that `vdom.id` is correct *before* any other configs (like `domListeners`) are processed in `initConfig`.
> 
> ### **Verification**
> - `Fire.spec.mjs`: Event bubbling and firing now work correctly.
> - `RealWorldUpdates.spec.mjs`: ID matching for updates is now correct.
> - `SortZone.spec.mjs`: VDOM lookups by ID now succeed.
> - `AutoId.spec.mjs`: The original collision fix remains verified.
> 
> All unit tests are passing.
> 
> Commit: 4d623c17b (#8468)

- 2026-01-09T15:12:08Z @tobiu closed this issue

