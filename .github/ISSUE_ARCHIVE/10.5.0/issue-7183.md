---
id: 7183
title: Fix `collection.Base#splice` Stack Overflow on Large Removals
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-11T16:52:16Z'
updatedAt: '2025-08-11T19:37:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7183'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-11T19:37:20Z'
---
# Fix `collection.Base#splice` Stack Overflow on Large Removals

**Reported by:** @tobiu on 2025-08-11

**Is your feature request related to a problem? Please describe.**

When clearing a collection that contains a very large number of records (e.g., 1 million), a `RangeError: Maximum call stack size exceeded` occurs. This happens because the `clear()` method calls `splice(0, count)`, and the `splice` method uses the spread operator (`...`) to push the removed items into a `removedItems` array. When `count` is very large, this attempts to pass too many arguments to the `push` function, exceeding the call stack limit.

The exact failing line is: `removedItems.push(...items.splice(index, removeCountAtIndex));`

**Describe the solution you'd like**

The `splice` method in `src/collection/Base.mjs` has been significantly optimized to handle large removals safely and efficiently.

The problematic line `removedItems.push(...items.splice(index, removeCountAtIndex));` has been replaced with a more robust solution that differentiates between full collection clears and partial removals:

1.  **For Full Collection Clears (e.g., `clear()`):**
    If `splice` is called to remove all items from the beginning (`index === 0 && removeCountAtIndex === me.count`), the optimization avoids expensive array operations. Instead, the `removedItems` variable is made to reference the original internal `_items` array, `_items` is then reassigned to an empty array, and the `map` is cleared directly using `map.clear()`. This is extremely efficient as it avoids creating new large arrays or iterating over millions of items.

2.  **For Partial Removals:**
    For all other removal scenarios, `removedItems = items.splice(index, removeCountAtIndex);` is used. This correctly captures the removed items without the `RangeError` caused by the spread operator. The `map` is then updated by iterating over these `removedItems` and deleting their corresponding entries.

This comprehensive approach ensures both correctness (no stack overflow) and optimal performance for all removal operations.

**Benefits:**

*   **Critical Bug Fix:** Prevents the application from crashing when clearing collections with very large datasets.
*   **Increased Robustness:** Makes the core collection class more resilient and predictable under heavy load.
*   **Code Simplification:** The corrected code is simpler and more efficient.

