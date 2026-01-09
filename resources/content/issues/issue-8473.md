---
id: 8473
title: Refactor afterSetId in Split Button and Grid Body
state: CLOSED
labels:
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-01-09T16:34:39Z'
updatedAt: '2026-01-09T16:38:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8473'
author: tobiu
commentsCount: 1
parentIssue: 8469
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T16:38:23Z'
---
# Refactor afterSetId in Split Button and Grid Body

**Context:**
`src/button/Split.mjs` and `src/grid/Body.mjs` implement manual VDOM ID assignment for their wrapper nodes in `afterSetId`.
This logic is now redundant because `Neo.mixin.VdomLifecycle.ensureStableIds` (invoked by `Component.Base`) automatically detects wrapper nodes (via `getVdomRoot()`) and assigns the standard `__wrapper` ID suffix.

**Goals:**
1.  Remove `afterSetId` from `src/button/Split.mjs`.
2.  Remove `afterSetId` from `src/grid/Body.mjs`.
3.  Verify that `ensureStableIds` correctly handles the ID assignment.

**Verification:**
- `Split` button and `Grid` body should still render with the correct `__wrapper` ID on their root element.

## Comments

### @tobiu - 2026-01-09 16:38

**Input from Gemini 3 Pro:**

> ✦ I have completed the refactoring for `src/button/Split.mjs` and `src/grid/Body.mjs`.
> 
> **Changes:**
> - Removed the manual `afterSetId` methods from both classes.
> - Verified that `Neo.mixin.VdomLifecycle.ensureStableIds` correctly assigns the `__wrapper` ID suffix to the root node and the raw ID to the component's internal root (`getVdomRoot()`).
> 
> **Verification:**
> - Added a new unit test: `test/playwright/unit/component/WrapperIdCheck.spec.mjs`.
> - Confirmed that `Neo.create(SplitButton)` and `Neo.create(GridBody)` produce the correct VDOM ID structure.
> 
> Commit: 08358cb4b (#8473)

## Activity Log

- 2026-01-09 @tobiu added the `ai` label
- 2026-01-09 @tobiu added the `refactoring` label
- 2026-01-09 @tobiu added the `core` label
- 2026-01-09 @tobiu added parent issue #8469
- 2026-01-09 @tobiu referenced in commit `08358cb` - "refactor: remove redundant afterSetId from Split and GridBody (#8473)"
- 2026-01-09 @tobiu assigned to @tobiu
- 2026-01-09 @tobiu closed this issue

