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
updatedAt: '2026-03-10T13:35:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9404'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 9405 Create `Neo.data.TreeModel`'
  - '[x] 9406 Create `Neo.data.TreeStore`'
  - '[x] 9407 Create `Neo.grid.column.Tree` & Cell Component'
  - '[x] 9408 Grid Core Integration & TreeGrid Accessibility'
  - '[ ] 9409 CSS Animations for TreeGrid Expand/Collapse'
  - '[x] 9410 TreeGrid Documentation & Examples'
  - '[x] 9411 TreeGrid Unit Tests (Data & Logic)'
  - '[x] 9412 TreeGrid Component Tests (UI & Interactions)'
  - '[x] 9413 Create Async Subtree Loading for `Neo.data.TreeStore`'
  - '[x] 9414 Refactor `Neo.data.Store` to unify Record Hydration'
  - '[x] 9415 Support "Turbo Mode" in `Neo.data.TreeStore`'
  - '[x] 9416 Add Error State & Events for Async Tree Loading'
  - '[x] 9417 Optimize `TreeStore` Hot Paths (Performance)'
  - '[ ] 9418 Create Data Normalizer Architecture (`Neo.data.normalizer.Base` & `Tree`)'
  - '[ ] 9419 Implement Dynamic Module Loading in `Neo.worker.Data`'
  - '[ ] 9420 Migrate Data Pipeline to Connection -> Parser -> Normalizer flow'
  - '[x] 9422 Update TreeStore to manage ARIA sibling fields on mutations'
  - '[x] 9423 TreeStore Full CRUD Support & Structural Mutations'
  - '[x] 9425 Refactor Tree cell component architecture for performance'
  - '[x] 9426 Refactor Tree column and component reactivity'
  - '[x] 9427 Fix TreeStore projection mutations and Row VDOM recycling'
  - '[x] 9428 TreeStore: Implement hierarchical sorting for doSort override'
  - '[x] 9429 TreeStore: Implement ancestor-aware filtering for filter override'
  - '[x] 9430 TreeModel: Introduce childCount to decouple isLeaf state from emptiness'
  - '[x] 9431 TreeStore: Fix ARIA desync (siblingIndex and siblingCount) after sort and filter'
  - '[x] 9432 TreeStore: Override clear() to prevent memory leaks and split-brain states'
  - '[x] 9433 TreeStore: Implement bulk expandAll() and collapseAll() methods'
  - '[x] 9434 TreeStore: Decouple clearFilters() from legacy allItems pattern'
  - '[x] 9435 TreeStore: Fix visible projection for dynamic child additions to expanded parents'
  - '[x] 9437 TreeStore: Optimize #allRecordsMap iteration loops'
  - '[x] 9438 TreeStore: Reduce GC pressure and redundant iterations'
  - '[x] 9439 TreeStore: Apply "Anchor & Echo" JSDoc strategy for AI discoverability'
  - '[x] 9445 TreeGrid Documentation: Create high-level architectural guide for TreeStore'
  - '[x] 9447 TreeGrid: Fix 7-click expand/collapse bug and redundant change events'
  - '[x] 9448 TreeGrid Component pooling accumulates `is-leaf` class leading to visual bugs'
subIssuesCompleted: 31
subIssuesTotal: 35
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
- 2026-03-09T18:16:54Z @tobiu cross-referenced by #9422
- 2026-03-09T18:19:04Z @tobiu added sub-issue #9422
- 2026-03-09T18:41:22Z @tobiu added sub-issue #9423
- 2026-03-09T18:59:56Z @tobiu referenced in commit `c478860` - "docs(data): Enhance TreeStore JSDoc with Projection Architecture details (#9404)"
- 2026-03-09T20:22:37Z @tobiu added sub-issue #9425
- 2026-03-10T10:32:06Z @tobiu added sub-issue #9426
- 2026-03-10T11:33:25Z @tobiu added sub-issue #9427
- 2026-03-10T13:16:02Z @tobiu added sub-issue #9428
- 2026-03-10T13:16:05Z @tobiu added sub-issue #9429
- 2026-03-10T13:25:32Z @tobiu added sub-issue #9430
### @tobiu - 2026-03-10T13:35:16Z

https://github.com/user-attachments/assets/4787104c-fb87-479f-8c9a-00abc29c1ca7

wip

- 2026-03-10T14:26:53Z @tobiu added sub-issue #9431
- 2026-03-10T14:26:56Z @tobiu added sub-issue #9432
- 2026-03-10T14:27:16Z @tobiu added sub-issue #9433
- 2026-03-10T14:27:18Z @tobiu added sub-issue #9434
- 2026-03-10T21:17:56Z @tobiu added sub-issue #9435
- 2026-03-11T10:00:18Z @tobiu added sub-issue #9437
- 2026-03-11T10:09:55Z @tobiu added sub-issue #9438
- 2026-03-11T10:53:13Z @tobiu added sub-issue #9439
- 2026-03-12T09:16:30Z @tobiu added sub-issue #9445
- 2026-03-12T10:37:00Z @tobiu added sub-issue #9447
- 2026-03-12T11:30:51Z @tobiu added sub-issue #9448

