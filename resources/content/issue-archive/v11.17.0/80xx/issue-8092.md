---
id: 8092
title: '[Refactor] Rename container.sortable to container.dragResortable'
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-11T19:24:50Z'
updatedAt: '2025-12-11T20:11:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8092'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-11T19:59:12Z'
---
# [Refactor] Rename container.sortable to container.dragResortable

Rename `sortable` to `dragResortable` in `src/container/Base.mjs` and related files to disambiguate from grid data sorting.
Scope:
1.  **Container Base:** Rename `sortable_` to `dragResortable_` and `afterSetSortable` to `afterSetDragResortable` in `src/container/Base.mjs`.
2.  **Standard Extensions:** Update `src/dashboard/Container.mjs` and `src/tab/Container.mjs`.
3.  **Tree List:** Rename `sortable_` to `dragResortable_` in `src/tree/List.mjs`.
4.  **Header Toolbars (Grid/Table):**
    *   Rename `draggable_` to `dragResortable_` in `src/grid/header/Toolbar.mjs` and `src/table/header/Toolbar.mjs`.
    *   **Crucial:** Do NOT change `sortable` in these files (it controls data sorting).
5.  **SortZones:** Update `src/draggable/container/SortZone.mjs` to check `owner.dragResortable`.
6.  **Apps & Examples:** Search and replace `sortable: true` with `dragResortable: true` in container configurations.

## Timeline

- 2025-12-11T19:24:52Z @tobiu added the `enhancement` label
- 2025-12-11T19:24:52Z @tobiu added the `ai` label
- 2025-12-11T19:24:53Z @tobiu added the `refactoring` label
- 2025-12-11T19:25:22Z @tobiu assigned to @tobiu
- 2025-12-11T19:25:41Z @tobiu added the `developer-experience` label
- 2025-12-11T19:56:20Z @tobiu referenced in commit `b48f980` - "[Refactor] Rename container.sortable to container.dragResortable #8092"
- 2025-12-11T19:59:13Z @tobiu closed this issue
### @tobiu - 2025-12-11T20:11:50Z

> ✦ I would rate the impact of this session as High.
> 
>   Impact Analysis:
> 
>    * Architectural Clarity (High):
>        * Disambiguation: The most critical win is separating sortable (data sorting) from dragResortable (item reordering). This resolves a confusing naming collision that was causing friction in complex components like Grids and Tables. It makes the API self-documenting.
>        * Standardization: Moving the SortZone creation logic to container.Base and establishing a clear override pattern (loadSortZoneModule, createSortZone) enforces a consistent architecture across the framework.
> 
>    * Developer Experience (High):
>        * Less Boilerplate: By leveraging inheritance in grid and table header toolbars, we deleted redundant imperative code. Future container extensions will be easier to write.
>        * Predictability: Developers now know exactly which config controls what behavior. dragResortable is explicit.
> 
>    * Maintainability (Medium-High):
>        * Centralized Logic: Fixing or enhancing the drag-and-drop initialization logic now happens in one place (container.Base), rather than  being scattered across multiple afterSet... methods.
>        * CSS Consolidation: Merging the toolbar animation CSS into container/SortZone.scss simplifies the theme structure.
> 
>    * Risk (Medium - Breaking Change):
>        * This is a breaking change. Any existing application using sortable: true on a TabContainer, Dashboard, or generic Container for drag-and-drop will break until updated.
>        * However, the migration path is trivial (search & replace), and the long-term benefit of avoiding the sortable conflict outweighs the short-term pain.
> 
> Summary:
> This was a necessary maturation step for the framework. As you added more complex components (Grid, Table), the overloaded sortable term  became a technical debt liability. Paying it down now prevents future bugs and makes the learning curve smoother for new adopters. The code is cleaner, DRY-er, and more semantic.


