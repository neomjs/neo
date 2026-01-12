---
id: 8388
title: Refactor Portal Learning Views to Shared Content Viewer
state: CLOSED
labels:
  - documentation
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-07T15:34:49Z'
updatedAt: '2026-01-07T15:51:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8388'
author: tobiu
commentsCount: 1
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T15:50:55Z'
---
# Refactor Portal Learning Views to Shared Content Viewer

Refactor the components in `apps/portal/view/learn` into a generic, reusable structure under `apps/portal/view/shared/content`.

**Goal:**
Enable the "Releases" section (and potentially others) to reuse the "Tree Nav + Content + Sections List" layout used by the "Learn" section.

**Scope:**
1.  Create `apps/portal/view/shared/content/`.
2.  Move and rename the following components to the new shared directory:
    -   `ContentTreeList.mjs` -> `TreeList.mjs`
    -   `ContentComponent.mjs` -> `Component.mjs`
    -   `PageContainer.mjs` -> `PageContainer.mjs`
    -   `PageSectionsContainer.mjs` -> `SectionsContainer.mjs`
    -   `PageSectionsList.mjs` -> `SectionsList.mjs`
    -   `MainContainer.mjs` -> `Container.mjs` (Base Layout)
3.  Ensure these shared components are decoupled from specific "Learn" stores where possible (relying on StateProvider store keys).
    -   Add `routePrefix` config to `TreeList` to handle different routing contexts (e.g. `/learn` vs `/releases`).
4.  Refactor `apps/portal/view/learn/MainContainer.mjs` to extend the new Shared Container.
5.  Update imports and references in `apps/portal/view/learn/`.
6.  Verify the "Learn" section continues to function correctly.

**Note:** Implementation of the "Releases" section using these new components is out of scope for this ticket.

## Timeline

- 2026-01-07T15:34:51Z @tobiu added the `documentation` label
- 2026-01-07T15:34:51Z @tobiu added the `refactoring` label
- 2026-01-07T15:36:23Z @tobiu assigned to @tobiu
- 2026-01-07T15:49:39Z @tobiu added parent issue #8362
- 2026-01-07T15:50:56Z @tobiu closed this issue
### @tobiu - 2026-01-07T15:51:22Z

**Input from Gemini 3 Pro:**

> ✦ Refactored Portal "Learn" views into a shared structure to support the upcoming "Releases" section.
> 
> **Changes:**
> -   **Shared Components:** Created `apps/portal/view/shared/content/` containing generic versions of the Learn components:
>     -   `Container.mjs` (Layout)
>     -   `TreeList.mjs` (Navigation)
>     -   `Component.mjs` (Markdown Viewer)
>     -   `PageContainer.mjs` (Main Content Area)
>     -   `SectionsContainer.mjs` & `SectionsList.mjs` (Right Sidebar)
> -   **Refactoring:** `apps/portal/view/learn/MainContainer.mjs` now extends the new shared `Container`.
> -   **Styling:** Moved and renamed corresponding SCSS files to `resources/scss/src/apps/portal/shared/content/` and updated CSS class names to be generic (e.g., `.portal-shared-content-container`).
> -   **Store Decoupling:** Updated `MainContainerController` and `MainContainerStateProvider` in `learn` to use generic store keys (`tree`, `sections`) instead of specific names.
> 
> This provides the foundation for the "Releases" section to reuse the same layout and logic.

- 2026-01-07T15:59:04Z @tobiu cross-referenced by #8389
- 2026-01-08T13:25:09Z @jonnyamsp referenced in commit `53c31bf` - "refactor(Portal): Move Learn content views to shared/content for reuse

- Created  components:
  -  (generic navigation tree with routePrefix)
  -  (Markdown content viewer)
  -  (Table of contents)
  -  (Right sidebar)
  -  (Main content area)
  -  (3-pane layout base)
- Refactored  to extend Shared Container.
- Updated Learn Controller and StateProvider to use generic store keys ('tree', 'sections').
- Moved and renamed SCSS files to  and updated CSS class names.
- Deleted old Learn-specific components and SCSS.
- Fixes #8388"

