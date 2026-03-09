---
id: 9404
title: '[Epic] Tree Grid & Hierarchical Data Support'
state: OPEN
labels:
  - enhancement
  - epic
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-09T10:43:40Z'
updatedAt: '2026-03-09T11:10:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9404'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 9405 Create `Neo.data.TreeModel`'
  - '[x] 9406 Create `Neo.data.TreeStore`'
  - '[ ] 9407 Create `Neo.grid.column.Tree` & Cell Component'
  - '[ ] 9408 Grid Core Integration & TreeGrid Accessibility'
  - '[ ] 9409 CSS Animations for TreeGrid Expand/Collapse'
  - '[ ] 9410 TreeGrid Documentation & Examples'
  - '[ ] 9411 TreeGrid Unit Tests (Data & Logic)'
  - '[ ] 9412 TreeGrid Component Tests (UI & Interactions)'
  - '[x] 9413 Create Async Subtree Loading for `Neo.data.TreeStore`'
  - '[x] 9414 Refactor `Neo.data.Store` to unify Record Hydration'
  - '[x] 9415 Support "Turbo Mode" in `Neo.data.TreeStore`'
  - '[x] 9416 Add Error State & Events for Async Tree Loading'
  - '[x] 9417 Optimize `TreeStore` Hot Paths (Performance)'
  - '[ ] 9418 Create Data Normalizer Architecture (`Neo.data.normalizer.Base` & `Tree`)'
  - '[ ] 9419 Implement Dynamic Module Loading in `Neo.worker.Data`'
  - '[ ] 9420 Migrate Data Pipeline to Connection -> Parser -> Normalizer flow'
subIssuesCompleted: 7
subIssuesTotal: 16
blockedBy: []
blocking: []
---
# [Epic] Tree Grid & Hierarchical Data Support

### Goal
Implement native, high-performance support for Tree Grids and hierarchical data structures within the Neo.mjs framework. This Epic focuses on the core "Hierarchical Rows" pattern (a flat virtualized view of tree nodes) ensuring O(1) rendering performance and strict adherence to the Row Pooling architecture.

### Scope & Architecture
The Tree Grid implementation is designed to integrate seamlessly with the existing `Neo.grid.Body` virtual scroller without requiring variable-height rows.

1.  **Data Abstraction (`Neo.data.TreeStore` & `TreeModel`):** 
    The complexity of the hierarchy is entirely managed by the data layer. The `TreeStore` parses hierarchical data (using `parentId` relations) into an internal O(1) `#childrenMap`. Crucially, it exposes a dynamically updated, **flattened 1D array of only the *visible* nodes** to the grid. When a node is expanded, its children are injected into this flat array.
2.  **Visual Representation (`Neo.grid.column.Tree`):** 
    A specialized, nested column component handles the visual state. It utilizes CSS variables (`--tree-depth`) for dynamic indentation math and CSS classes for toggle icon states, ensuring rapid recycling during scroll events without DOM manipulation.
3.  **Accessibility (WAI-ARIA):** 
    By leveraging the flattened array approach, the virtual scroller naturally provides gapless, contiguous `aria-rowindex` values. The implementation is augmented with `aria-expanded`, `aria-level`, `aria-setsize`, and `aria-posinset` attributes mapped directly from the records (utilizing "Soft Hydration" where necessary).
4.  **Interaction:** 
    Expansion and collapse interactions are handled via event delegation on the Grid Body, triggering state mutations in the Store, which subsequently fire events (`expand`, `collapse`) for View Controller consumption.

*Note: Variable-height "Row Expanders" (nested content bodies) are outside the scope of this Epic and would require a separate architectural enhancement to the ScrollManager.*

## Timeline

- 2026-03-09T10:43:41Z @tobiu added the `enhancement` label
- 2026-03-09T10:43:41Z @tobiu added the `epic` label
- 2026-03-09T10:43:41Z @tobiu added the `ai` label
- 2026-03-09T10:43:42Z @tobiu added the `architecture` label
- 2026-03-09T10:43:42Z @tobiu added the `grid` label
- 2026-03-09T10:44:15Z @tobiu added sub-issue #9405
- 2026-03-09T10:44:23Z @tobiu added sub-issue #9406
- 2026-03-09T10:52:27Z @tobiu added sub-issue #9407
- 2026-03-09T10:59:33Z @tobiu added sub-issue #9408
- 2026-03-09T11:01:33Z @tobiu added sub-issue #9409
- 2026-03-09T11:01:40Z @tobiu added sub-issue #9410
- 2026-03-09T11:03:54Z @tobiu added sub-issue #9411
- 2026-03-09T11:03:57Z @tobiu added sub-issue #9412
- 2026-03-09T11:10:33Z @tobiu assigned to @tobiu
- 2026-03-09T11:34:01Z @tobiu added sub-issue #9413
- 2026-03-09T14:13:27Z @tobiu added sub-issue #9414
- 2026-03-09T14:14:06Z @tobiu added sub-issue #9415
- 2026-03-09T14:47:34Z @tobiu added sub-issue #9416
- 2026-03-09T15:00:11Z @tobiu added sub-issue #9417
- 2026-03-09T15:45:19Z @tobiu cross-referenced by #9418
- 2026-03-09T15:45:33Z @tobiu added sub-issue #9418
- 2026-03-09T15:46:10Z @tobiu cross-referenced by #9419
- 2026-03-09T15:46:22Z @tobiu added sub-issue #9419
- 2026-03-09T15:46:48Z @tobiu added sub-issue #9420

