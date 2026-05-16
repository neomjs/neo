---
id: 8813
title: Refactor to Generic unmountConfigs in Component Abstract
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-19T14:49:41Z'
updatedAt: '2026-01-19T14:54:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8813'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T14:54:05Z'
---
# Refactor to Generic unmountConfigs in Component Abstract

**Objective:**
Generalize the `resetActiveIndexOnUnmount` pattern introduced in #8812 by moving it to `Neo.component.Abstract` as a generic `unmountConfigs` config.

**Motivation:**
The "Phantom Mount" issue (state persisting on unmounted components in persistent layouts) is likely to affect other components and configs, not just `activeIndex` in `TabContainer`. A generic mechanism to reset *any* config on unmount is a more robust architectural solution.

**Changes:**
1.  **`src/component/Abstract.mjs`**: Introduce `unmountConfigs` (Object).
    -   In `afterSetMounted`, if `mounted` becomes `false`, iterate over `unmountConfigs` and apply them via `this.set()`.
    -   Use `merge: 'deep'` descriptor to allow subclasses to extend it easily.
2.  **`src/tab/Container.mjs`**: Remove the specific `resetActiveIndexOnUnmount` config and logic.
3.  **`apps/portal/view/news/TabContainer.mjs`**: Update to use `unmountConfigs: { activeIndex: null }`.

**Benefits:**
-   Standardizes state reset behavior across the framework.
-   Reduces ad-hoc logic in specific components.
-   Leverages the existing config system.

**Related Issues:**
-   #8812 (Initial fix)

## Timeline

- 2026-01-19T14:49:42Z @tobiu added the `ai` label
- 2026-01-19T14:49:42Z @tobiu added the `refactoring` label
- 2026-01-19T14:49:42Z @tobiu added the `core` label
- 2026-01-19T14:53:17Z @tobiu referenced in commit `e99b951` - "refactor: generalize unmount state reset via unmountConfigs (#8813)"
### @tobiu - 2026-01-19T14:53:35Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully refactored the "Phantom Mount" fix to be generic and reusable.
> 
> **Implementation Details:**
> 1.  **`src/component/Abstract.mjs`**:
>     -   Introduced `unmountConfigs` config (Object) with `merge: 'deep'`.
>     -   Updated `afterSetMounted` to apply the configs defined in `unmountConfigs` when `mounted` becomes `false`.
>     -   Added `isDescriptor` import to support the deep merge strategy.
>     -   Added the missing `_` suffix to `unmountConfigs_` to make it reactive and properly processed by `Neo.setupClass`.
> 
> 2.  **`src/tab/Container.mjs`**:
>     -   Removed the `resetActiveIndexOnUnmount` config and logic, as it is now superseded by the generic solution.
> 
> 3.  **`apps/portal/view/news/TabContainer.mjs`**:
>     -   Updated to use the new generic API:
>         ```javascript
>         unmountConfigs: {
>             activeIndex: null
>         }
>         ```
> 
> This change provides a robust, framework-level mechanism for handling state reset on unmount, solving the immediate "Phantom Mount" issue while enabling future use cases for other components.

- 2026-01-19T14:53:51Z @tobiu assigned to @tobiu
- 2026-01-19T14:54:05Z @tobiu closed this issue

