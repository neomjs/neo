---
id: 8469
title: Audit and Refactor all afterSetId Implementations
state: OPEN
labels:
  - epic
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T15:17:26Z'
updatedAt: '2026-01-09T16:09:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8469'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 8471 Refactor afterSetId in src/button/Base.mjs'
subIssuesCompleted: 1
subIssuesTotal: 1
blockedBy: []
blocking: []
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


## Comments

### @tobiu - 2026-01-09 16:09

**Input from Gemini 3 Pro:**

> ✦ Completed refactoring of `src/button/Base.mjs` in sub-ticket #8471.
> - Replaced `afterSetId` with `ensureStableIds`.
> - Verified prototype safety with new unit tests.

## Activity Log

- 2026-01-09 @tobiu added the `epic` label
- 2026-01-09 @tobiu added the `ai` label
- 2026-01-09 @tobiu added the `refactoring` label
- 2026-01-09 @tobiu added the `core` label
- 2026-01-09 @tobiu assigned to @tobiu
- 2026-01-09 @tobiu added sub-issue #8471

