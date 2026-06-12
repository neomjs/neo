---
id: 7118
title: 'Bug Report: `collection.Base#move()` fails on sibling swaps'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-27T17:51:14Z'
updatedAt: '2025-07-27T17:52:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7118'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-27T17:52:58Z'
---
# Bug Report: `collection.Base#move()` fails on sibling swaps

## Summary

A bug was identified in `src/collection/Base.mjs` where the `move()` method failed to correctly swap adjacent items in a collection. This was discovered as a regression issue in `src/draggable/grid/header/toolbar/SortZone.mjs` after the `columnPositions` data structure was migrated from a standard `Array` to a `Neo.collection.Base`.

## The Bug

The root cause was the implementation of the `move()` method, which used a nested, one-liner `splice()` call:

```javascript
// old implementation
items.splice(toIndex, 0, items.splice(fromIndex, 1)[0]);
```

This common pattern, while concise, can lead to unpredictable side effects. The inner `splice()` modifies the array, and depending on the JavaScript engine's implementation, this can happen before the `toIndex` for the outer `splice()` is correctly resolved. This resulted in the move operation failing, particularly when swapping an item at index `n` with an item at index `n+1`.

## The Fix

The `move()` method was refactored to unroll the operation into two distinct and safer steps:

1.  **Remove:** The item at `fromIndex` is explicitly removed from the array and stored in a constant.
2.  **Insert:** The stored item is then inserted at the `toIndex`.

```javascript
// new implementation
const item = items.splice(fromIndex, 1)[0];
items.splice(toIndex, 0, item);
```

This two-step approach guarantees that the indices are correct for both operations, resolving the bug.

### Code Quality Enhancements

-   **Intent-driven Comment:** A detailed comment was added to the `move()` method to explain *why* the two-step approach is used, preventing future developers from "optimizing" it back to the buggy one-liner.
-   **Unit Tests:** A comprehensive test suite was added to `test/siesta/tests/CollectionBase.mjs` to cover various move scenarios, including forward, backward, and adjacent swaps, ensuring the fix is robust and preventing future regressions.

This ticket documents the successful resolution of the issue.

## Timeline

- 2025-07-27T17:51:14Z @tobiu assigned to @tobiu
- 2025-07-27T17:51:15Z @tobiu added the `enhancement` label
- 2025-07-27T17:52:38Z @tobiu referenced in commit `5b15ad3` - "Bug Report: collection.Base#move() fails on sibling swaps #7118"
- 2025-07-27T17:52:58Z @tobiu closed this issue

