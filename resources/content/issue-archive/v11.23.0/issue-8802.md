---
id: 8802
title: Extend async destruction handling to VdomLifecycle and Component
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-01-19T10:29:17Z'
updatedAt: '2026-01-19T10:46:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8802'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T10:45:01Z'
---
# Extend async destruction handling to VdomLifecycle and Component

Extend the `Neo.isDestroyed` rejection pattern introduced in #8801.

**Plan:**
1.  **Refactor `core.Base`**:
    -   Rename `#timeouts` to `#asyncRejects`.
    -   Add `registerAsync(id, reject)` and `unregisterAsync(id)`.
    -   Add `trap(promise)` helper to wrap external promises (like remote calls).
    -   Update `timeout` to use new methods.
2.  **Update `mixin.VdomLifecycle`**:
    -   Refactor `promiseUpdate` to register its reject function.
3.  **Update `component.Base`**:
    -   Refactor `getDomRect` to use `this.trap()`.
    -   Refactor `measure` to use `this.trap()`.

This ensures `await component.promiseUpdate()` and `await component.getDomRect()` correctly throw `Neo.isDestroyed` if the component is destroyed during the operation.

## Timeline

- 2026-01-19T10:29:18Z @tobiu added the `enhancement` label
- 2026-01-19T10:29:18Z @tobiu added the `ai` label
- 2026-01-19T10:29:18Z @tobiu added the `architecture` label
- 2026-01-19T10:29:19Z @tobiu added the `core` label
- 2026-01-19T10:44:15Z @tobiu referenced in commit `904ca29` - "feat: Extend async destruction handling to VdomLifecycle and Component (#8802)"
### @tobiu - 2026-01-19T10:44:44Z

**Input from Gemini 3 Pro:**

> ✦ I have extended the async destruction handling pattern to `VdomLifecycle` and `Component`.
> 
> **Changes:**
> 1.  **`src/core/Base.mjs`**:
>     -   Renamed `#timeouts` to `#asyncRejects`.
>     -   Added `registerAsync`, `unregisterAsync`, and `trap` to manage generic cancellable promises.
> 2.  **`src/mixin/VdomLifecycle.mjs`**:
>     -   Updated `promiseUpdate()` to use the new registration system.
> 3.  **`src/component/Base.mjs`**:
>     -   Updated `getDomRect()` and `measure()` to use `this.trap()`.
> 4.  **Tests**:
>     -   Added `test/playwright/unit/core/AsyncDestruction.spec.mjs` to verify the new behavior.
> 
> **Verification:**
> Unit tests confirm that these methods now correctly reject with `Neo.isDestroyed` if the component is destroyed during execution.

- 2026-01-19T10:45:01Z @tobiu closed this issue
- 2026-01-19T10:46:51Z @tobiu assigned to @tobiu

