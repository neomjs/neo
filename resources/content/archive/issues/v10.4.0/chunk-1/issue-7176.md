---
id: 7176
title: GridBody `onStoreLoad` Fast Path for Clearing Rows
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-11T08:33:21Z'
updatedAt: '2025-08-11T08:34:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7176'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-11T08:34:13Z'
---
# GridBody `onStoreLoad` Fast Path for Clearing Rows

## Motivation

When a grid with a very large number of rows (e.g., 100,000) has its store cleared via `store.removeAll()` or by loading an empty dataset, the standard `update()` process introduces a noticeable performance overhead.

The `createViewData()` method is fast in this scenario, as it has no new rows to generate. However, the subsequent `me.update()` call triggers a full VDOM diff between the 100,000 existing rows and the new empty state. While Neo's diffing algorithm is highly optimized, this is still a significant and unnecessary amount of work.

Initial benchmarks showed that clearing a 100k row grid took ~13ms. While this is within a single frame, it's an overhead that can be completely avoided. The goal is to make this operation near-instantaneous.

## Implementation

A "fast path" was added to the `grid.Body#onStoreLoad()` method to specifically handle this scenario.

The logic is as follows:
1.  Check if the incoming `data` from the `load` event is empty (`data?.length < 1`).
2.  If it is, and if the grid body currently has rows, it bypasses the standard `createViewData()` and `update()` calls entirely.
3.  It directly clears the internal VDOM array: `vdomRoot.cn = []`.
4.  It clears the VNode cache: `me.getVnodeRoot().childNodes = []`.
5.  It sends a single, direct delta to the main thread to clear the real DOM: `Neo.applyDeltas({id: vdomRoot.id, textContent: ''})`.

A descriptive comment was also added to the code to explain the rationale behind this optimization.

## Benefits

- **Drastic Performance Improvement:** Reduces the time to clear a large grid from ~13ms to a negligible amount, making the UI feel instantaneous.
- **Reduced CPU Load:** Avoids a large, unnecessary VDOM diffing operation.
- **Improved Code Efficiency:** Handles a common, specific use case with a highly optimized, targeted solution.

## Timeline

- 2025-08-11T08:33:21Z @tobiu assigned to @tobiu
- 2025-08-11T08:33:22Z @tobiu added the `enhancement` label
- 2025-08-11T08:34:04Z @tobiu referenced in commit `d19f6d8` - "GridBody onStoreLoad Fast Path for Clearing Rows #7176"
- 2025-08-11T08:34:13Z @tobiu closed this issue

