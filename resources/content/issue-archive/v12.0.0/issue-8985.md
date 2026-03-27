---
id: 8985
title: 'refactor: Add getRow helper to GridBody'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-04T13:28:07Z'
updatedAt: '2026-02-04T13:33:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8985'
author: tobiu
commentsCount: 1
parentIssue: 8964
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-04T13:33:41Z'
---
# refactor: Add getRow helper to GridBody

**Objective:**
Refactor the logic for retrieving a `Neo.grid.Row` component instance given a data record into a reusable helper method `getRow(record)` within `Neo.grid.Body`.

**Current State:**
`Neo.grid.column.AnimatedChange` manually calculates the row index and accesses the body's item array using modulo arithmetic:
```javascript
row = body.items[body.store.indexOf(record) % body.items.length]
```

**Proposed Change:**
1.  **Implement `Neo.grid.Body.getRow(record)`:**
    *   Find the record's index in the store.
    *   Verify the index is within the currently `mountedRows` range.
    *   Return the corresponding `Row` component from the pool.
2.  **Update Consumers:** Refactor `Neo.grid.column.AnimatedChange` to use this new method.

**Benefits:**
*   **Encapsulation:** Hides row pooling implementation details (modulo logic) from columns.
*   **Safety:** Ensures the returned row is actually currently mounted and assigned to the target record.
*   **Reusability:** Useful for other column types or controllers needing row access.


## Timeline

- 2026-02-04T13:28:09Z @tobiu added the `ai` label
- 2026-02-04T13:28:09Z @tobiu added the `refactoring` label
- 2026-02-04T13:31:59Z @tobiu referenced in commit `04c2bc6` - "refactor: Add getRow helper to GridBody (#8985)"
### @tobiu - 2026-02-04T13:32:36Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the `getRow` helper and refactored `AnimatedChange` to use it.
> 
> **Changes:**
> 1.  **`src/grid/Body.mjs`:** Added `getRow(record)`. This method encapsulates the logic for finding a row component:
>     *   It retrieves the record index.
>     *   It checks if the index is within the `mountedRows` range (safety check).
>     *   It returns the recycled row component using modulo arithmetic on the pool size.
> 2.  **`src/grid/column/AnimatedChange.mjs`:** Updated to use `body.getRow(record)` instead of manual calculation. This is cleaner and safer.
> 
> I have pushed the changes to the feature branch.

- 2026-02-04T13:33:08Z @tobiu assigned to @tobiu
- 2026-02-04T13:33:28Z @tobiu added parent issue #8964
- 2026-02-04T13:33:41Z @tobiu closed this issue

