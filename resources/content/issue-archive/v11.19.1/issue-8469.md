---
id: 8469
title: Audit and Refactor all afterSetId Implementations
state: CLOSED
labels:
  - epic
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T15:17:26Z'
updatedAt: '2026-01-09T17:26:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8469'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 8471 Refactor afterSetId in src/button/Base.mjs'
  - '[x] 8472 Implement Lazy VDOM Cloning in Component Base'
  - '[x] 8473 Refactor afterSetId in Split Button and Grid Body'
  - '[x] 8474 Enforce Eager VDOM Cloning in Component Constructor'
  - '[x] 8475 Remove redundant ensureStableIds from Button Base'
  - '[x] 8476 Refactor Gallery to remove manual afterSetId ID assignment'
  - '[x] 8477 Refactor Progress Component ID handling'
  - '[x] 8478 Refactor afterSetId in Form Fields to ensureStableIds'
subIssuesCompleted: 8
subIssuesTotal: 8
blockedBy: []
blocking: []
closedAt: '2026-01-09T17:26:48Z'
---
# Audit and Refactor all afterSetId Implementations

Following the VDOM ID stabilization fix (#8467), we need to audit all occurrences of `afterSetId` in the codebase.

**Context:**
We discovered that `Component.Base#afterSetId` was previously mutating the class prototype's `_vdom` and that manual VDOM ID assignment is now handled centrally by `VdomLifecycle#ensureStableIds`.

**Goals:**
1.  **Redundancy Removal:** Identify and remove any manual VDOM ID assignment logic that is now handled by `ensureStableIds`.
2.  **Safety Check:** Ensure no other implementations are mutating class prototypes (e.g., modifying `_vdom` or `vdom` properties during the construction phase before `initConfig` completes).
3.  **Compatibility:** Verify that component-specific logic (e.g., updating ARIA attributes, specific DOM lookups) is compatible with the new wrapper ID scheme.

**Files to Audit:**
- `src/button/Base.mjs`
- `src/button/Split.mjs`
- `src/component/Abstract.mjs`
- `src/component/Base.mjs` (Already refactored, double-check)
- `src/component/Gallery.mjs`
- `src/component/Progress.mjs`
- `src/core/Base.mjs`
- `src/grid/Body.mjs`


## Timeline

- 2026-01-09T15:17:28Z @tobiu added the `epic` label
- 2026-01-09T15:17:28Z @tobiu added the `ai` label
- 2026-01-09T15:17:28Z @tobiu added the `refactoring` label
- 2026-01-09T15:17:29Z @tobiu added the `core` label
- 2026-01-09T16:08:19Z @tobiu assigned to @tobiu
- 2026-01-09T16:09:16Z @tobiu added sub-issue #8471
### @tobiu - 2026-01-09T16:09:50Z

**Input from Gemini 3 Pro:**

> ✦ Completed refactoring of `src/button/Base.mjs` in sub-ticket #8471.
> - Replaced `afterSetId` with `ensureStableIds`.
> - Verified prototype safety with new unit tests.

- 2026-01-09T16:26:39Z @tobiu added sub-issue #8472
- 2026-01-09T16:34:49Z @tobiu added sub-issue #8473
- 2026-01-09T16:43:07Z @tobiu added sub-issue #8474
- 2026-01-09T16:57:29Z @tobiu added sub-issue #8475
- 2026-01-09T17:07:16Z @tobiu added sub-issue #8476
- 2026-01-09T17:14:58Z @tobiu added sub-issue #8477
- 2026-01-09T17:21:17Z @tobiu added sub-issue #8478
### @tobiu - 2026-01-09T17:26:22Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the audit and refactoring of all `afterSetId` implementations.
> 
> **Summary of Work:**
> 1.  **Core Safety:** Implemented eager VDOM cloning in `Neo.component.Base.construct` (#8474) to prevent prototype pollution from early VDOM access.
> 2.  **Logic Centralization:**
>     -   Refactored `src/button/Split.mjs`, `src/grid/Body.mjs`, `src/component/Progress.mjs`, `src/component/Gallery.mjs`, `src/form/field/CheckBox.mjs`, `src/form/field/FileUpload.mjs`, and `src/form/field/Text.mjs`.
>     -   Replaced manual `afterSetId` logic with `ensureStableIds` overrides where appropriate.
>     -   Removed redundant `ensureStableIds` from `src/button/Base.mjs`.
> 3.  **Audit:** Verified that `src/component/Abstract.mjs` and `src/core/Base.mjs` use `afterSetId` correctly for manager registration, which is outside the scope of VDOM stabilization.
> 
> **Outcome:**
> The codebase now enforces a consistent, safe, and centralized pattern for VDOM ID assignment.
> 
> I am closing this Epic.

- 2026-01-09T17:26:48Z @tobiu closed this issue

