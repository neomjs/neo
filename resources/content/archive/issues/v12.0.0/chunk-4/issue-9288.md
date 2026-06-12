---
id: 9288
title: '[Enhancement] Generic Theme Support for Icon and IconLink Grid Columns'
state: CLOSED
labels:
  - enhancement
  - grid
assignees:
  - tobiu
createdAt: '2026-02-24T10:48:56Z'
updatedAt: '2026-02-24T10:54:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9288'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-24T10:54:22Z'
---
# [Enhancement] Generic Theme Support for Icon and IconLink Grid Columns

**Context**
Currently, `Neo.grid.column.Icon` and `Neo.grid.column.IconLink` render their inner components using the default `inherit` font-size from `Neo.component.Icon`. When placed inside a grid (where the default text size is 13px), these icons often appear too small (e.g., social media icons or status badges).

**The Problem**
If an application wants to increase the size of these icons to 16px to make them legible within a grid, developers are forced to write custom, app-specific CSS overrides that target the `.neo-grid-cell` and the specific column classes (e.g., `.devindex-column-linkedin`). This pollutes app-level SCSS and prevents a consistent, out-of-the-box experience.

**The Solution**
Leverage the architectural pattern where non-component grid columns (extending `core.Base`) can still inject theme files via `afterSetWindowId()`. 

We will create generic SCSS files for these columns:
- `resources/scss/src/grid/column/Icon.scss`
- `resources/scss/src/grid/column/IconLink.scss`
- And corresponding variable definitions for `theme-neo-dark` and `theme-neo-light`.

These files will define CSS variables like `--grid-column-icon-font-size: 16px` specifically scoped within `.neo-grid-cell`, ensuring consistent 16px icons and properly aligned 13px labels for all Icon/IconLink columns across the framework, without affecting standalone components.

## Timeline

- 2026-02-24T10:48:58Z @tobiu added the `enhancement` label
- 2026-02-24T10:48:58Z @tobiu added the `grid` label
- 2026-02-24T10:50:23Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-24T10:50:40Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the generic SCSS files and the `Base.mjs` documentation.
> 
> Six new SCSS files were created across `src`, `theme-neo-dark`, and `theme-neo-light` to establish a generic 16px baseline for `Icon` and `IconLink` columns when rendered inside `.neo-grid-cell`. 
> 
> I also added an intent-driven JSDoc comment to `src/grid/column/Base.mjs` documenting the "Non-Component Theme Injection" architectural pattern to ensure developers understand how and why this works.
> 
> The changes are staged and ready for commit.

- 2026-02-24T10:51:39Z @tobiu referenced in commit `3d04f29` - "feat(grid): Implement generic theme support for Icon and IconLink columns (#9288)"
- 2026-02-24T10:54:23Z @tobiu closed this issue

