---
id: 8094
title: Refactor Store sorting to use symbol-based initialIndex strategy
state: CLOSED
labels:
  - bug
  - epic
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-11T22:12:17Z'
updatedAt: '2025-12-11T22:21:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8094'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-11T22:21:06Z'
---
# Refactor Store sorting to use symbol-based initialIndex strategy

This epic refactors the `Store` sorting mechanism to be more memory-efficient and robust by eliminating the duplication of data into `initialData` and instead using a lightweight, symbol-based index on records.

### Problem
1.  **Crash on Reset:** `Store.sort({direction: null})` caused a crash (`TypeError: me.initialData is not iterable`) when `initialData` was null or not synced.
2.  **Memory Overhead:** The previous approach duplicated the entire dataset into `initialData` solely for restoring sort order, doubling memory usage for large stores.
3.  **Synchronization Issues:** Keeping `initialData` in sync with dynamic `add`/`remove`/`filter` operations was complex and error-prone.
4.  **UI Updates:** The Grid failed to refresh the view when sorting was reset to the initial state.

### Solution Architecture

#### 1. Symbol-Based Indexing (`initialIndexSymbol`)
Instead of storing a separate array of data, we now tag each record with its insertion index using a non-enumerable symbol property.
*   **`src/collection/Base.mjs`**: Introduced `initialIndexCounter`. The `splice` method now automatically assigns a unique, incrementing index to every new item using `Symbol.for('initialIndex')`.
*   **`src/data/RecordFactory.mjs`**: Updated the generated `Record` class to include a field for `[initialIndexSymbol]`. The constructor ensures this index is preserved when converting raw data objects into Record instances.

#### 2. Streamlined Store Sorting
*   **`src/data/Store.mjs`**: 
    *   Removed `initialData` config and all related synchronization logic (`beforeSetInitialData`, `afterSetData`).
    *   Updated `sort()` to restore the natural order by sorting on `initialIndexSymbol` instead of clearing and reloading data.
    *   Enabled `me.fire('load')` in `onCollectionSort` to ensure explicit sort operations trigger UI updates.

#### 3. Optimized Event Flow
*   **`src/collection/Base.mjs`**: Modified `splice` to perform sorting silently (`silent=true`). This prevents redundant `sort` events (and subsequent double-reloads) during data mutations, allowing `Store` to listen to `sort` events strictly for user-initiated sorting.

#### 4. Grid Container Updates
*   **`src/grid/Container.mjs`**: Updated `onSortColumn` to ensure the UI refreshes correctly even when the sort direction is `null` (reset), fixing the specific UI regression.

### Benefits
*   **Performance:** Reduced memory footprint by removing data duplication.
*   **Stability:** Eliminated the crash vector associated with `initialData` syncing.
*   **Maintainability:** Centralized index logic in `Collection.Base`, making it available to all collections, not just Stores.
*   **Correctness:** Sorting reset now reliably updates the UI.

## Timeline

- 2025-12-11T22:12:18Z @tobiu added the `bug` label
- 2025-12-11T22:12:18Z @tobiu added the `epic` label
- 2025-12-11T22:12:18Z @tobiu added the `refactoring` label
- 2025-12-11T22:18:49Z @tobiu assigned to @tobiu
- 2025-12-11T22:19:17Z @tobiu referenced in commit `19d2c50` - "Refactor Store sorting to use symbol-based initialIndex strategy #8094"
- 2025-12-11T22:21:07Z @tobiu closed this issue

