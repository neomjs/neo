---
id: 6921
title: Collections for Filters & Sorters in `Neo.collection.Base`
state: OPEN
labels:
  - enhancement
  - no auto close
assignees: []
createdAt: '2025-07-01T00:23:16Z'
updatedAt: '2025-10-22T22:49:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6921'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Collections for Filters & Sorters in `Neo.collection.Base`

### Problem Statement

Currently, the `filters` and `sorters` configurations in `Neo.collection.Base` are standard JavaScript arrays. While this works, it introduces a subtle inconsistency in the reactivity model and can lead to less intuitive API usage for managing these lists.

Specifically:
- Adding or removing `Filter` or `Sorter` instances requires reassigning the entire `filters` or `sorters` array (e.g., `collection.filters = [...collection.filters, newFilter];`) to trigger reactivity. Simply mutating the array (e.g., `collection.filters.push(newFilter);`) does not trigger the necessary `afterSetFilters`/`afterSetSorters` hooks.
- This behavior can be a source of confusion for developers expecting array mutations to be reactive, especially given Neo.mjs's strong emphasis on reactivity.
- Managing the order or specific removal of filters/sorters becomes less ergonomic compared to having dedicated collection methods.

### Proposed Solution

Transform the `filters` and `sorters` configurations within `Neo.collection.Base` from plain JavaScript arrays into instances of `Neo.collection.Base` themselves.

This would mean:
- `collection.filters` would become a `Neo.collection.Base` instance.
- `collection.sorters` would become a `Neo.collection.Base` instance.

### Benefits

1.  **Enhanced Reactivity & Intuition:** Changes to the filter/sorter collections (e.g., `collection.filters.add(newFilter)`, `collection.sorters.remove(sorterInstance)`) would automatically trigger the parent collection's re-filter/re-sort logic, as the child collection's `mutate` event would propagate. This eliminates the need for manual array reassignments and aligns perfectly with Neo.mjs's reactive philosophy.
2.  **Consistent API:** Developers could manage filters and sorters using the rich set of methods already available on `Neo.collection.Base` (e.g., `add`, `remove`, `insert`, `clear`, `move`, `find`, `get`).
3.  **Framework Idiomatic:** This change would make the `Neo.collection.Base` class even more consistent with the framework's core principles, where complex lists of reactive objects are managed by collections.
4.  **Simplified Code:** Reduces boilerplate code for managing filter/sorter lists and makes the code more readable and maintainable.

### Potential Considerations

-   **Backward Compatibility:** This would be a breaking change for existing applications that directly manipulate `filters` or `sorters` as plain arrays. A clear migration strategy or a new configuration name (e.g., `filterCollection`, `sorterCollection`) might be necessary to ease the transition.
-   **Performance Overhead:** There might be a marginal increase in object creation and memory usage due to each filter/sorter list becoming a full `Neo.collection.Base` instance. However, given the typical number of filters/sorters, this overhead is likely negligible compared to the developer experience and architectural benefits.

### Example Usage (Conceptual)

```javascript
// Before (current behavior)
myCollection.filters.push({ property: 'status', value: 'active' });
myCollection.filters = [...myCollection.filters]; // Required to trigger re-filter

// After (proposed behavior)
myCollection.filters.add({ property: 'status', value: 'active' }); // Automatically triggers re-filter

// Other new possibilities
myCollection.filters.remove(myFilterInstance);
myCollection.sorters.clear();
myCollection.filters.findFirst('property', 'name');
```

This enhancement would significantly improve the ergonomics and consistency of managing filters and sorters within Neo.mjs applications.

## Timeline

- 2025-07-01T00:23:17Z @tobiu added the `enhancement` label
- 2025-07-01T00:23:17Z @tobiu added the `no auto close` label

