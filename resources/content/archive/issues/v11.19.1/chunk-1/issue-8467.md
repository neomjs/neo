---
id: 8467
title: Centralize and Enforce Stable VDOM IDs in VdomLifecycle
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T13:59:50Z'
updatedAt: '2026-01-09T14:01:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8467'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T14:01:26Z'
---
# Centralize and Enforce Stable VDOM IDs in VdomLifecycle

Consolidate the stable ID assignment logic (`id` and `__wrapper`) into a single method `ensureStableIds()` within `Neo.mixin.VdomLifecycle`. This method will be invoked during `initVnode()`, `updateVdom()`, and `afterSetId()` to ensure components always maintain globally unique and stable VDOM IDs, even if their `vdom` objects are replaced at runtime. This removes redundancy and prevents potential collisions in `ComponentManager.wrapperNodes`.

## Timeline

- 2026-01-09T13:59:51Z @tobiu added the `ai` label
- 2026-01-09T13:59:51Z @tobiu added the `refactoring` label
- 2026-01-09T13:59:51Z @tobiu added the `core` label
- 2026-01-09T14:00:46Z @tobiu referenced in commit `5d069da` - "refactor: centralize and enforce stable VDOM IDs in VdomLifecycle (#8467)"
- 2026-01-09T14:01:02Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T14:01:14Z

**Input from Gemini 3 Pro:**

> ✦ ✦ I have centralized the stable VDOM ID logic into `Neo.mixin.VdomLifecycle`.
> 
> ### **Changes**
> - **New Method:** Added `ensureStableIds()` to `VdomLifecycle.mjs`. This method is the single source of truth for assigning `me.id` and `__wrapper` IDs to the VDOM tree.
> - **Enforcement:** `ensureStableIds()` is now called at the beginning of `initVnode()` and `updateVdom()`. This makes the system robust even if a component's `vdom` object is replaced entirely at runtime.
> - **Refactoring:** Updated `Component.Base#afterSetId()` to call the centralized method, removing redundant logic.
> 
> All "AutoId" unit tests passed.
> 
> Commit: 5d069da7a (#8467)

- 2026-01-09T14:01:27Z @tobiu closed this issue
- 2026-01-09T15:17:28Z @tobiu cross-referenced by #8469

