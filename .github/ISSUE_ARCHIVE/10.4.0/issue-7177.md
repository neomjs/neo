---
id: 7177
title: Fix Collection `splice` "Maximum call stack size exceeded" Error
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-11T09:33:19Z'
updatedAt: '2025-08-11T09:34:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7177'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-11T09:34:10Z'
---
# Fix Collection `splice` "Maximum call stack size exceeded" Error

**Reported by:** @tobiu on 2025-08-11

## Motivation

When dynamically adding a very large number of items (e.g., >100,000) to an **already populated** `Neo.collection.Base` instance, a `RangeError: Maximum call stack size exceeded` would occur.

This was discovered in a scenario where a store was first populated with 1,000 items, and then a subsequent `add()` call was made with 99,000 more items. The initial creation works fine, but the run-time increase triggers the error.

The root cause was identified in the `collection.Base#splice` method, specifically in this line:
`items.splice(Neo.isNumber(index) ? index : items.length, 0, ...addedItems)`

When `items` is not empty, the code uses `splice` with the spread operator (`...addedItems`). On a very large `addedItems` array, this attempts to pass tens of thousands of individual arguments to the `splice` function, exceeding the JavaScript engine's call stack limit.

## Implementation

The `splice` method in `collection.Base.mjs` was modified to use a dual strategy based on the number of items being added.

1.  **Threshold:** A threshold of 5000 items was introduced to switch between methods.

2.  **For Small Arrays (< 5000 items):**
    - The original `items.splice(..., ...addedItems)` implementation is used.
    - **Rationale:** This method is significantly faster and more memory-efficient for arrays safely within the call stack limits, as it performs a single, highly optimized native operation.

3.  **For Large Arrays (>= 5000 items):**
    - A manual, safe splice is performed: `me._items = beginning.concat(addedItems, end);`.
    - **Rationale:** This approach avoids the spread operator entirely, thus preventing the stack overflow error. While it has more overhead due to the creation of intermediate arrays via `slice()` and `concat()`, it provides a robust fallback that allows the application to handle massive run-time data additions without crashing.

## Benefits

- **Critical Bug Fix:** Prevents the application from crashing when adding very large datasets to an existing collection at run-time.
- **Balanced Performance:** The solution is optimized for both common and extreme use cases. It retains the high performance of the native `splice` for day-to-day operations while ensuring stability for massive data loads.
- **Increased Robustness:** Makes the core collection class more resilient and predictable under heavy load.

