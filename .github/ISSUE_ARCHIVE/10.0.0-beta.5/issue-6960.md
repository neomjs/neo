---
id: 6960
title: 'Bug(core.Config): Regression in beforeSet hooks with v10 config system'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-06T16:36:00Z'
updatedAt: '2025-07-06T16:37:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6960'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-06T16:37:04Z'
---
# Bug(core.Config): Regression in beforeSet hooks with v10 config system

**Reported by:** @tobiu on 2025-07-06

**Description**

With the introduction of the `core.Config` controller in v10, a regression bug was identified that affects batched updates. When updating multiple configs simultaneously using `instance.set({a: 'newA', b: 'newB'})`, the `beforeSet` hooks for one config could not reliably access the new, pending value of other configs in the same batch.

This behavior is a departure from the pre-v10 system and breaks the atomicity of `set()` operations. The issue was identified in `test/siesta/tests/ClassSystem.mjs`.

**Root Cause**

The regression was traced to the interaction between the new `core.Config` instances and the existing `autoGenerateGetSet` function in `Neo.mjs`. The getter for a config was retrieving its `oldValue` directly from the `Config` instance, while the setter logic created race conditions where pending values in `configSymbol` were either deleted too early or not available during nested hook calls.

**Solution**

The generated setter in `Neo.mjs#autoGenerateGetSet` was refactored to restore the expected behavior, following a robust, four-step transactional process:

1.  **Prevent Recursion:** The pending value is immediately removed from `configSymbol`.
2.  **Temporary State:** The new value is temporarily assigned to the private backing field (e.g., `this._a = 'newA'`). This makes the new value available to all other getters during the `beforeSet` phase.
3.  **Restore State:** After the `beforeSet` hook runs, the private backing field is reverted to its original value. This is critical to ensure that the final change detection works correctly.
4.  **Finalize Change:** `config.set()` is called. It compares the new value against the now-restored original value, correctly detects the change, and triggers the `afterSet` hooks.

This fix restores the pre-v10 atomicity of `set()` operations, ensuring that all `beforeSet` hooks within a batch see a consistent, updated view of all pending changes.

