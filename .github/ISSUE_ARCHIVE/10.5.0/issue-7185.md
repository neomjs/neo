---
id: 7185
title: 'Data: Implement Lazy Record Instantiation for Stores'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-12T00:01:21Z'
updatedAt: '2025-08-12T00:02:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7185'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-12T00:02:31Z'
---
# Data: Implement Lazy Record Instantiation for Stores

**Reported by:** @tobiu on 2025-08-12

### Is your feature request related to a problem? Please describe.
When working with large datasets, the eager instantiation of `Neo.data.Record` instances for every data item in a `Neo.data.Store` can lead to significant performance overhead and increased memory consumption, especially during initial data loading. This is particularly noticeable when only a subset of records is actively displayed or interacted with (e.g., in grids with virtual scrolling).

### Describe the solution you'd like
Implement a "GET driven" approach for `Neo.data.Store` where `Neo.data.Record` instances are instantiated lazily, only when they are explicitly accessed.

This involves:

1.  **`Neo.collection.Base` Enhancements:**
    *   Modify `first()` and `last()` methods to internally use `this.getAt()`, leveraging polymorphism for `Store` subclasses.
    *   Add a generic `forEach()` method that iterates over the collection's items.

2.  **`Neo.data.Store` Overrides and Logic:**
    *   Modify `Store.add()` and `Store.beforeSetData()` to store raw data objects directly into the underlying `Collection.Base` without immediate `Record` instantiation.
    *   Override `Store.get()` and `Store.getAt()` to perform the lazy `Record` instantiation. When a raw data object is accessed, it is converted into a `Record` instance using `Neo.data.RecordFactory.createRecord()`, and this `Record` instance then replaces the raw data object in the collection's internal `_items` array and `map` for subsequent faster access.
    *   Override `Store.first()`, `Store.last()`, `Store.find()`, `Store.findBy()`, and `Store.forEach()` to ensure that all returned or iterated items are `Record` instances, leveraging the lazy conversion in `Store.get()` and `Store.getAt()`.

3.  **Consumer Code Updates:**
    *   Update all direct accesses to `store.items[i]` to `store.getAt(i)`.
    *   Replace `store.items.forEach()` with `store.forEach()`.
    *   Convert `for...of` loops over `store.items` to traditional `for` loops using `store.getAt(i)`.
    *   Adjust specific `Array.prototype.find` usages on `store.items` to use appropriate `Store` methods or `for` loops.

### Describe alternatives you've considered
(No specific alternatives considered as this is an optimization of an existing process.)

### Additional context
This refactoring significantly improves the performance and memory footprint of applications dealing with large datasets by deferring the creation of `Record` instances until they are actually needed.

This feature was implemented through a series of commits, including the initial commit `e76ed9180e32027c157a5615305a824ef820de91` which highlighted the need for such optimizations.

**Benchmark Results (from `examples/grid/bigData`):**

| Scenario                 | Before (Eager Instantiation) | After (Lazy Instantiation) | Improvement |
| :----------------------- | :--------------------------- | :------------------------- | :---------- |
| 1,000 rows, 50 columns   | 49ms (Record creation)       | 45ms (Data gen + add)      | ~8%         |
| 50,000 rows, 50 columns  | 2391ms (Record creation)     | 302ms (Data gen + add)     | ~87%        |
| 50,000 rows, 100 columns | 4377ms (Record creation)     | 329ms (Data gen + add)     | ~92%        |

These results demonstrate a dramatic reduction in the initial data processing time, especially for larger datasets, leading to a much more responsive user experience.

