---
id: 9167
title: '[Grid] Fix Runtime Buffer Updates (Phase 1: Functional)'
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-02-15T12:00:37Z'
updatedAt: '2026-02-15T12:47:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9167'
author: tobiu
commentsCount: 1
parentIssue: 9165
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T12:47:23Z'
---
# [Grid] Fix Runtime Buffer Updates (Phase 1: Functional)

Runtime changes to `bufferRowRange` and `bufferColumnRange` currently break the grid rendering (blank grid or missing cells).

This ticket covers the "Make it work" phase, prioritizing correctness over performance.
We likely need to trigger a full re-render or correctly re-initialize the row/cell pools when these configs change.

Parent Issue: #9165

## Timeline

- 2026-02-15T12:00:38Z @tobiu added the `bug` label
- 2026-02-15T12:00:38Z @tobiu added the `ai` label
- 2026-02-15T12:00:38Z @tobiu added the `regression` label
- 2026-02-15T12:01:13Z @tobiu assigned to @tobiu
- 2026-02-15T12:01:21Z @tobiu added parent issue #9165
- 2026-02-15T12:45:20Z @tobiu referenced in commit `868dca3` - "fix(grid): Resolve runtime buffer update regressions (#9167)

Corrects Defects:
1. Grid Body: Added force parameter to 'updateMountedAndVisibleColumns' to bypass optimization checks during buffer changes. Added default 'startIndex=0' initialization.
2. DevIndex Controller: Fixed 'NaN' issue by correctly handling Record objects returned by ComboBox 'forceSelection'.
3. DevIndex Controls: Synchronized initial ComboBox values with GridContainer defaults to prevent UI mismatch.

Includes new regression test: 'test/playwright/unit/grid/PoolingRuntimeUpdates.spec.mjs'."
### @tobiu - 2026-02-15T12:46:29Z

**Input from Gemini 3 Pro:**

> ✦ Fixed the regression where runtime buffer updates caused the grid to render blank.
> 
> **Resolution:**
> 1.  **Core Framework (`src/grid/Body.mjs`):**
>     -   Updated `updateMountedAndVisibleColumns` to accept a `force` parameter, bypassing optimization checks when the buffer changes but the scroll position hasn't.
>     -   Ensured `startIndex` initializes to `0` to prevent `NaN` propagation.
>     -   Refactored `afterSetBufferColumnRange` and `afterSetBufferRowRange` to trigger a forced, non-recycled render (`createViewData(false, true)`), allowing the pooling logic to resize correctly.
> 
> 2.  **Application Logic (`apps/devindex`):**
>     -   **Controller:** Fixed `NaN` bug in `MainContainerController` where `onBuffer*Change` handlers received `Record` objects instead of primitive values (due to `forceSelection: true`).
>     -   **View:** Synchronized `ControlsContainer` ComboBox defaults (5 rows, 3 cols) with `GridContainer` to prevent initial state mismatch.
> 
> **Verification:**
> -   Added regression test: `test/playwright/unit/grid/PoolingRuntimeUpdates.spec.mjs`.
> -   Verified both Row and Column buffer expansion at runtime.

- 2026-02-15T12:47:24Z @tobiu closed this issue

