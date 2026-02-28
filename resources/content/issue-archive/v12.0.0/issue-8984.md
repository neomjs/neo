---
id: 8984
title: Fix Grid Row Reactivity & AnimatedChange Column for In-Place Updates
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-04T13:09:52Z'
updatedAt: '2026-02-04T13:22:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8984'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T13:22:23Z'
---
# Fix Grid Row Reactivity & AnimatedChange Column for In-Place Updates

**Problem:**
In the BigData grid example, the "Increase Counter" button modifies a record property in place (`record.counter++`), but the UI does not update.

**Causes:**
1.  **Row Update Failure:** In-place record updates maintain the same record reference and rowIndex. The new `Neo.grid.Row` architecture relies on reactive config changes to trigger updates. Since the values are strictly equal, `row.record = record` does not trigger `afterSetRecord`, and thus no VDOM update occurs.
2.  **Animation Failure:** The `AnimatedChange` column implementation is obsolete. It currently attempts to find the cell node within `body.vdom` and call `body.update()`. With the new architecture, the Body VDOM is a container of Row components, not the full cell markup. The column needs to target the specific `Row` component's VDOM and trigger a row-level update.

**Solution:**
1.  **Force Row Update:** Update `GridBody.onStoreRecordChange` to explicitly call `row.createVdom()` when a record is modified, ensuring the new data is rendered even if the record reference hasn't changed.
2.  **Refactor Animation:** Update `src/grid/column/AnimatedChange.mjs` to:
    -   Locate the correct `Row` component instance.
    -   Modify the *Row's* VDOM to add the animation class.
    -   Call `row.update()` instead of `body.update()`.


## Timeline

- 2026-02-04T13:09:54Z @tobiu added the `bug` label
- 2026-02-04T13:09:54Z @tobiu added the `ai` label
- 2026-02-04T13:10:39Z @tobiu added parent issue #8964
- 2026-02-04T13:21:33Z @tobiu referenced in commit `88e3a2b` - "fix: Grid Row Reactivity & AnimatedChange Column for In-Place Updates (#8984)"
### @tobiu - 2026-02-04T13:21:44Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fix for in-place record updates and animations.
> 
> **Changes:**
> 1.  **`src/grid/Body.mjs`:** In `onStoreRecordChange`, we now explicitly call `row.createVdom()`. This is necessary because in-place updates (like `record.counter++`) do not change the record object reference, so the reactive config system would otherwise skip the update.
> 2.  **`src/grid/column/AnimatedChange.mjs`:** Refactored `onRecordChange` to work with the new Row architecture.
>     -   It now correctly calculates the `Row` component instance based on the record index and pool size.
>     -   It modifies the VDOM of that specific `Row` instance.
>     -   It triggers `row.update()` instead of the global `body.update()`, ensuring efficient, granular rendering.
> 
> I have pushed the changes to the feature branch.

- 2026-02-04T13:21:58Z @tobiu assigned to @tobiu
- 2026-02-04T13:22:23Z @tobiu closed this issue

