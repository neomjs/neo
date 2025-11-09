---
id: 7186
title: >-
  Enhanced Store & Grid Performance with Lazy Record Instantiation and
  Configurable Chunking
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-12T01:13:17Z'
updatedAt: '2025-08-12T01:15:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7186'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-12T01:15:51Z'
---
# Enhanced Store & Grid Performance with Lazy Record Instantiation and Configurable Chunking

**Reported by:** @tobiu on 2025-08-12

### Is your feature request related to a problem? Please describe.
Prior to this enhancement, handling large datasets in `Neo.data.Store` and `Neo.grid.Container` presented several performance challenges:
1.  **Eager Record Instantiation:** All `Neo.data.Record` instances were created upfront, leading to significant initial load times and memory consumption for large datasets.
2.  **UI Freezes during Large Data Adds:** Synchronously adding extremely large numbers of raw data objects to the store could cause noticeable UI freezes.
3.  **VDom Reconciliation Errors with Chunking:** The existing chunking mechanism (intended to mitigate UI freezes) could lead to VDom reconciliation errors (e.g., `RangeError`, infinite loops) due to component ID collisions in `Neo.grid.column.Component`.
4.  **Component Instance Overhead:** Component columns could create and retain numerous component instances, contributing to memory overhead and rendering performance issues.

### Describe the solution you'd like
This feature introduces a comprehensive set of enhancements to `Neo.data.Store` and `Neo.grid.Container` to address the aforementioned performance bottlenecks and improve overall responsiveness when dealing with large datasets.

Key aspects of the solution include:

1.  **Lazy Record Instantiation (GET-driven approach):**
    *   `Neo.data.Store` now stores raw data objects directly. `Neo.data.Record` instances are created lazily, only when an item is explicitly accessed via `store.get()`, `store.getAt()`, `store.first()`, `store.last()`, `store.find()`, `store.findBy()`, or `store.forEach()`.
    *   Once a raw data object is converted to a `Record` instance, the `Record` instance replaces the raw data in the store's internal collection for subsequent faster access.

2.  **Configurable Data Chunking:**
    *   The `Neo.data.Store` now includes an `initialChunkSize` config (Number, default `0`). When set to a non-zero value, `Store.add()` will add data in chunks, mitigating UI freezes for very large synchronous data loads.
    *   The `postChunkLoad` event is used to signal the completion of a chunked load.

3.  **Robust Component ID Management:**
    *   `Neo.grid.column.Component.mjs#getComponentId` now conditionally generates component IDs. If the store is in a chunking phase (`store.chunkingTotal` is truthy), it uses the `rowIndex` directly for unique IDs, preventing collisions. Otherwise, it uses the modulo-based ID generation for virtual scrolling.

4.  **Automated Component Instance Cleanup:**
    *   `Neo.grid.Body` now includes `clearComponentColumnMaps()` and `cleanupComponentInstances()` methods.
    *   `clearComponentColumnMaps()` is called when the grid body is destroyed or when the store is completely cleared, ensuring all component instances are destroyed.
    *   `cleanupComponentInstances()` is called after a chunked load (`postChunkLoad`) to destroy component instances that are no longer visible or needed (i.e., outside the `mountedRows` range), reducing memory overhead.
    *   `Grid.Body#afterSetStore` also triggers `clearComponentColumnMaps()` when the store changes, ensuring proper cleanup of components from the old store.

### Describe alternatives you've considered
(No specific alternatives considered as this is a comprehensive set of optimizations addressing multiple interconnected performance aspects.)

### Additional context
This refactoring significantly improves the performance and memory footprint of applications dealing with large datasets by deferring the creation of `Record` instances and optimizing VDom reconciliation for chunked data.

**Benchmark Results (from `examples/grid/bigData`):**

| Scenario                               | Before (Eager Instantiation) | After (Lazy Instantiation, no chunking) | After (Lazy Instantiation, with chunking) |
| :------------------------------------- | :--------------------------- | :-------------------------------------- | :---------------------------------------- |
| 1,000 rows, 50 columns                 | 49ms (Record creation)       | 2ms (Data gen + add)                    | 2ms (Data gen + add)                      |
| 50,000 rows, 50 columns                | 2391ms (Record creation)     | 93ms (Data gen + add)                   | 1252ms (Data gen + add)                   |
| 50,000 rows, 100 columns               | 4377ms (Record creation)     | 95ms (Data gen + add)                   | 1289ms (Data gen + add)                   |
| 1,000,000 rows, 50 columns             | N/A (too slow)               | ~1.86s (estimated Data gen + add)       | 1433ms (Data gen + add)                   |
| **Observed UI Freeze (1M rows, 50 cols)** | N/A (too slow)               | ~5s (observed)                          | ~10s (observed)                           |

*Note: "Record creation" refers to the time taken for `Neo.data.Record` instantiation. "Data gen + add" refers to the time taken to generate raw data and add it to the store's collection.*

The benchmarks demonstrate a dramatic reduction in initial data processing time due to lazy instantiation. While synchronous adding of 1M rows still causes a UI freeze, the configurable chunking mechanism provides a way to manage this for perceived performance. The resolution of VDom errors and component cleanup further enhance stability and efficiency.

