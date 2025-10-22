---
id: 7187
title: Grid Row Vertical Scrolling Optimization with translate3d
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-12T01:49:13Z'
updatedAt: '2025-08-12T01:50:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7187'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-12T01:50:16Z'
---
# Grid Row Vertical Scrolling Optimization with translate3d

**Reported by:** @tobiu on 2025-08-12

### Is your feature request related to a problem? Please describe.
While the Neo.mjs grid uses virtual scrolling, the vertical positioning of rows was previously achieved using `transform: translateY(Ypx)`. For grids with a large number of rows (e.g., 100,000 or 1,000,000 rows), rapid vertical scrolling could sometimes feel less fluid or "unbearable," even with lazy record instantiation and optimized VDom diffing for the mounted range. This suggested that the browser's rendering pipeline might not be fully optimizing the 2D transform updates.

### Describe the solution you'd like
To enhance the fluidity and performance of vertical row scrolling, the `transform` property for grid rows has been updated from `translateY(Ypx)` to `translate3d(0px, Ypx, 0px)`.

This change leverages the browser's ability to promote elements with 3D transforms to their own composite layers on the GPU. By offloading the row positioning updates to the GPU, the CPU is freed up for other tasks (like JavaScript execution and VDom diffing), leading to a smoother and more responsive scrolling experience.

### Describe alternatives you've considered
(No specific alternatives considered as this is a targeted optimization for an existing mechanism.)

### Additional context
This optimization is particularly beneficial for grids displaying a large number of rows, where the cumulative effect of frequent row position updates can impact perceived performance. Initial observations indicate a noticeable improvement in vertical scrolling fluidity.

This feature was implemented in `src/grid/Body.mjs#createRow`.

