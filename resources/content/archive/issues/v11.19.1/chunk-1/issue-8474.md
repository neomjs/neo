---
id: 8474
title: Enforce Eager VDOM Cloning in Component Constructor
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T16:42:58Z'
updatedAt: '2026-01-09T16:45:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8474'
author: tobiu
commentsCount: 1
parentIssue: 8469
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T16:45:41Z'
---
# Enforce Eager VDOM Cloning in Component Constructor

**Context:**
The previous fix (#8472) added lazy cloning to the `vdom` getter. However, if a subclass accesses `this._vdom` directly (bypassing the getter) during the construction phase (e.g. in `afterSetId`), prototype pollution still occurs.

**Goal:**
Implement `construct()` in `Neo.component.Base` to perform **eager cloning** of the VDOM if it hasn't been cloned yet.
This ensures that `this._vdom` is an instance property *before* `super.construct()` runs (which triggers `afterSetId`).

**Verification:**
Use `test/playwright/unit/component/Base_PrototypePollution_Direct.spec.mjs` to verify that direct access is also safe.

## Timeline

- 2026-01-09T16:42:59Z @tobiu added the `bug` label
- 2026-01-09T16:43:00Z @tobiu added the `ai` label
- 2026-01-09T16:43:00Z @tobiu added the `refactoring` label
- 2026-01-09T16:43:00Z @tobiu added the `core` label
- 2026-01-09T16:43:07Z @tobiu added parent issue #8469
- 2026-01-09T16:45:08Z @tobiu referenced in commit `12958ca` - "fix: enforce eager VDOM cloning in Component constructor to prevent direct access pollution (#8474)"
- 2026-01-09T16:45:14Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T16:45:24Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the **eager VDOM cloning** mechanism in `src/component/Base.mjs`.
> 
> **Changes:**
> - Overrode the `construct(config)` method in `Neo.component.Base`.
> - Added a check `!Object.hasOwn(this, '_vdom') && this._vdom`.
> - If true, it performs `this._vdom = Neo.clone(this._vdom, true)` **before** calling `super.construct(config)`.
> 
> **Why this is critical:**
> - `super.construct` (in `core.Base`) sets `this.id`, which triggers `afterSetId`.
> - Some legacy code or anti-patterns might access `this._vdom` (direct private access) inside `afterSetId` or other early setters.
> - By ensuring `_vdom` is an instance property *before* the parent constructor runs, we effectively "firewall" the prototype against any mutation during the entire construction sequence.
> 
> **Verification:**
> - Added `test/playwright/unit/component/Base_PrototypePollution_Direct.spec.mjs`.
> - This test explicitly bypasses the getter and accesses `this._vdom` directly in `afterSetId`.
> - The test passed, confirming the prototype remains clean.
> 
> Commit: 12958cae8 (#8474)

- 2026-01-09T16:45:42Z @tobiu closed this issue
- 2026-01-09T16:54:24Z @tobiu referenced in commit `c51f5c7` - "refactor: remove redundant lazy VDOM cloning from getter, rely on construct (#8474)"
- 2026-01-09T17:26:23Z @tobiu cross-referenced by #8469

