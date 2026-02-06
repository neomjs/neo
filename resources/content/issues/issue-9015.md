---
id: 9015
title: Fix Regression in Cell Selection Model Cycling (Crash in updateRows)
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-02-06T16:52:58Z'
updatedAt: '2026-02-06T16:58:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9015'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-06T16:58:28Z'
---
# Fix Regression in Cell Selection Model Cycling (Crash in updateRows)

Cycling through cells (e.g., arrow left on first column to last) causes a crash in `BaseModel.updateRows`.
The error `TypeError: Cannot read properties of undefined (reading 'cls')` occurs because `cellNode` can be undefined if the target cell is not currently rendered (unmounted), but the code attempts to access `cellNode.cls` to determine `alreadySelect` state before checking if `cellNode` exists.

**Stack Trace:**
```text
BaseModel.mjs:72 Uncaught TypeError: Cannot read properties of undefined (reading 'cls')
    at BaseModel.mjs:72:54
    at Array.forEach (<anonymous>)
    at CellModel.updateRows (BaseModel.mjs:54:15)
```

**Proposed Fix:**
1.  Safe access `cellNode?.cls` in `BaseModel.mjs`.
2.  Ensure `aria-selected` is applied to cells in `src/grid/Row.mjs` to ensure unmounted cells get correct attributes when they are eventually rendered.


## Timeline

- 2026-02-06T16:52:59Z @tobiu added the `bug` label
- 2026-02-06T16:52:59Z @tobiu added the `ai` label
- 2026-02-06T16:52:59Z @tobiu added the `regression` label
- 2026-02-06T16:57:38Z @tobiu referenced in commit `1a2d910` - "bugfix: Fix regression in Cell Selection Model Cycling (Crash in updateRows) (#9015)"
- 2026-02-06T16:57:51Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-06T16:58:08Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved the regression causing the crash during cell cycling and added `aria-selected` support for cell models.
> 
> **Fixes Implemented:**
> 1.  **Crash Fix in `BaseModel.updateRows`:**
>     *   The code now safely checks `cellNode?.cls` before attempting to read `includes`.
>     *   This prevents the `TypeError` when cycling causes the selection of an unmounted cell (e.g., during a scroll jump).
> 
> 2.  **`aria-selected` for Cells:**
>     *   **In `BaseModel`:** Added logic to toggle the `aria-selected` attribute on the cell node during granular updates (`updateRows`), matching the behavior for rows.
>     *   **In `Row.mjs`:** Updated `applyRendererOutput` to strictly check `selectedCells.includes(logicalCellId)` and apply both the `neo-selected` class AND `aria-selected=true`.
>     *   **Optimization:** In `Row.mjs`, combined the selection check to occur *after* `cellConfig` creation, modifying the `cls` array in-place and setting the attribute in one block. This avoids duplicating the `includes` check.
> 
> The cell selection model should now cycle correctly without errors and properly report accessibility state.

- 2026-02-06T16:58:29Z @tobiu closed this issue

