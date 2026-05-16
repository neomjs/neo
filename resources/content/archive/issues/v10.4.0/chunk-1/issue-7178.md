---
id: 7178
title: High-Performance Chunking for `Store.add()` via `suspendEvents`
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-11T10:05:49Z'
updatedAt: '2025-08-11T10:06:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7178'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-11T10:06:47Z'
---
# High-Performance Chunking for `Store.add()` via `suspendEvents`

## Motivation

When adding a very large number of records (e.g., 1 million) to a `Neo.data.Store` in a single operation, the synchronous processing can block the application worker for a significant amount of time (e.g., 4+ seconds). This makes the entire application UI unresponsive until the operation is complete, leading to a poor user experience.

The goal is to handle large data additions in a way that provides immediate feedback to the user and prevents the UI from freezing, using the framework's intended event management features.

## Implementation

A two-chunk loading strategy was implemented in the `Store.add()` method. This approach leverages Neo.mjs's multi-threaded architecture and the `suspendEvents` property from `core.Observable` to control the data flow precisely and efficiently.

The logic is as follows:

1.  **Threshold Check:** The `add()` method first checks if the number of items being added exceeds a defined threshold (e.g., 1000). If not, it proceeds with the standard, synchronous `super.add()` call.

2.  **Chunk 1: The "Interactive" Batch (Synchronous):**
    - If the threshold is exceeded, the incoming array of items is split into two parts: the first 1000 items, and the rest.
    - `super.add()` is called synchronously with the first chunk. This triggers the store's `mutate` event, which in turn calls the `onCollectionMutate` listener, firing the `load` event. This causes the connected grid to immediately render the initial 1000 rows, making the UI responsive almost instantly.

3.  **Chunk 2: The "Background" Batch (Silent & Immediate):**
    - Immediately after the first chunk is added, the store's `suspendEvents` flag is set to `true`.
    - `super.add()` is then called again with the rest of the items. Because `suspendEvents` is true, the `fire()` method inside the collection's `add` logic will exit early, preventing any `mutate` or `load` events from firing. This "silent" addition happens in the app worker, which can be busy while the vdom and main threads are handling the initial render.
    - The `suspendEvents` flag is then set back to `false`.

4.  **Finalization:**
    - A final, manual `load` event is fired. This signals to the grid that the entire dataset is now available, allowing it to update its scrollbar to the correct full size and reflect the complete data.

## Benefits

- **Immediate UI Responsiveness:** The grid becomes populated and interactive almost instantly, even when the full dataset is massive.
- **Non-Blocking Data Load:** The bulk of the data processing happens without freezing the UI, correctly utilizing the app worker while other workers handle rendering.
- **Idiomatic Code:** Uses the built-in `suspendEvents` property, which is the intended, declarative way to batch operations without firing events. This is cleaner and more robust than manually managing listeners.
- **Improved User Experience:** Eliminates long freezes when loading large amounts of data.

## Timeline

- 2025-08-11T10:05:50Z @tobiu assigned to @tobiu
- 2025-08-11T10:05:51Z @tobiu added the `enhancement` label
- 2025-08-11T10:06:38Z @tobiu referenced in commit `47668b6` - "High-Performance Chunking for Store.add() via suspendEvents #7178"
- 2025-08-11T10:06:47Z @tobiu closed this issue

