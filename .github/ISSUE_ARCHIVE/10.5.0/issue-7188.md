---
id: 7188
title: ComboBox Display Fix and BigData Grid Example Enhancement
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-12T02:08:21Z'
updatedAt: '2025-08-12T02:08:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7188'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-12T02:08:44Z'
---
# ComboBox Display Fix and BigData Grid Example Enhancement

**Reported by:** @tobiu on 2025-08-12

### Is your feature request related to a problem? Please describe.
1.  **ComboBox Initial Display Issue:** Following the implementation of lazy record instantiation, `Neo.form.field.ComboBox` instances failed to display their initial `value` when the associated store contained raw data (e.g., arrays of strings or numbers). The input field would appear blank until the picker was opened, which would then trigger record instantiation.
2.  **BigData Grid Example Scope:** The `examples/grid/bigData` demo, while showcasing large datasets, did not fully push the limits of column count, which is also a significant factor in grid performance.

### Describe the solution you'd like
This feature addresses the ComboBox display issue and enhances the `examples/grid/bigData` demo to provide a more comprehensive performance testing ground.

1.  **ComboBox Initial Display Fix:**
    *   The `Neo.form.field.ComboBox#updateInputValueFromValue` method has been enhanced to correctly display the initial `value` even when the store contains raw data. It now intelligently handles `Neo.data.Record` instances, primitive values (strings/numbers), and raw data objects, ensuring the input field is populated as expected.

2.  **BigData Grid Example Enhancement:**
    *   The `examples/grid/bigData/MainStore.mjs` has been updated to include control options for `200` columns, allowing for testing with up to `100,000 rows * 200 columns = 20,000,000 cells`. This provides a more extreme test case for grid rendering and scrolling performance.

### Describe alternatives you've considered
(No specific alternatives considered as these are direct fixes and enhancements.)

### Additional context
The ComboBox fix ensures a better user experience by correctly displaying pre-selected values in fields backed by lazily instantiated stores. The enhanced BigData grid example provides a valuable tool for benchmarking and optimizing grid performance under very high load conditions, particularly relevant for VDom reconciliation and rendering with a large number of columns.

**ComboBox Fix Implementation:**
*   `src/form/field/ComboBox.mjs#updateInputValueFromValue` was modified.

**BigData Grid Example Enhancement:**
*   `examples/grid/bigData/MainStore.mjs` was updated to include new column options.

