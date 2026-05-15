---
id: 8472
title: Implement Lazy VDOM Cloning in Component Base
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T16:25:45Z'
updatedAt: '2026-01-09T16:33:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8472'
author: tobiu
commentsCount: 1
parentIssue: 8469
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T16:33:08Z'
---
# Implement Lazy VDOM Cloning in Component Base

**Context:**
`Neo.core.Base` assigns an instance ID early in the constructor, triggering `afterSetId`.
In `Neo.component.Base`, `afterSetId` calls `ensureStableIds`, which accesses `this.vdom`.
Since `initConfig` (and `mergeConfig`) has not yet run, `this.vdom` returns the **prototype's** `_vdom` reference.
Modifying this object (as `ensureStableIds` does) causes prototype pollution, affecting all subsequent instances of the class.

**Goal:**
Modify the `vdom` getter in `src/component/Base.mjs` to implement lazy cloning.
1. Check if `this._vdom` is an own property (using `Object.hasOwn`).
2. If not, clone the prototype's `_vdom` onto the instance immediately.
3. Update `mergeConfig` to respect this lazy initialization (avoid double cloning if already done).

**Verification:**
Add a regression test in `test/playwright/unit/component/Base_PrototypePollution.spec.mjs` that verifies:
1. Creating Instance A.
2. Creating Instance B.
3. Ensuring Instance B's VDOM does not contain Instance A's ID.

## Timeline

- 2026-01-09T16:25:47Z @tobiu added the `bug` label
- 2026-01-09T16:25:47Z @tobiu added the `ai` label
- 2026-01-09T16:25:47Z @tobiu added the `refactoring` label
- 2026-01-09T16:25:47Z @tobiu added the `core` label
- 2026-01-09T16:26:39Z @tobiu added parent issue #8469
- 2026-01-09T16:32:27Z @tobiu referenced in commit `64cdb76` - "fix: implement lazy VDOM cloning in Component.Base to prevent prototype pollution (#8472)"
- 2026-01-09T16:32:35Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T16:32:49Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the lazy VDOM cloning mechanism in `src/component/Base.mjs`.
> 
> **Changes:**
> - Modified the `vdom` getter to check for `Object.hasOwn(this, '_vdom')`. If missing, it immediately clones the prototype's `_vdom` to the instance.
> - This ensures that any early access to `this.vdom` (e.g., in `afterSetId` before `initConfig`) operates on a safe instance copy, preventing prototype pollution.
> 
> **Verification:**
> - Added a new regression test: `test/playwright/unit/component/Base_PrototypePollution.spec.mjs`.
> - The test explicitly reproduces the "early access" pattern and verifies that subsequent instances do not inherit the mutated VDOM ID.
> - Ran existing VDOM tests (`AutoId.spec.mjs` and `button/Base.spec.mjs`) to ensure no regressions. All passed.
> 
> Commit: 64cdb7694 (#8472)

- 2026-01-09T16:33:08Z @tobiu closed this issue
- 2026-01-09T16:42:59Z @tobiu cross-referenced by #8474

