---
id: 9152
title: '[DevIndex] Add Hireable and Website columns to Grid'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-14T13:04:44Z'
updatedAt: '2026-02-14T17:44:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9152'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-14T17:44:38Z'
---
# [DevIndex] Add Hireable and Website columns to Grid

Add `Hireable` and `Website` columns to the main grid in DevIndex.
- `Hireable`: Boolean icon column. Position near generic icon/link columns.
- `Website`: Link column.
- Create generic `Neo.component.Icon` and `Neo.grid.column.Icon` to support these and future icon-based columns efficiently (pooling).
- Create generic `Neo.component.IconLink` and `Neo.grid.column.IconLink` to support these and future icon-link-based columns efficiently (pooling).
- Refactor existing icon columns (like LinkedIn) to use the new generic implementation if applicable.
- The new components need their own `scss` files and support for the `neo-dark` and `neo-light` theme based on theme variables. Avoid inline styles.

## Timeline

- 2026-02-14T13:04:45Z @tobiu added the `enhancement` label
- 2026-02-14T13:04:45Z @tobiu added the `ai` label
- 2026-02-14T13:05:00Z @tobiu added parent issue #9106
- 2026-02-14T16:38:58Z @tobiu assigned to @tobiu
- 2026-02-14T16:41:14Z @tobiu referenced in commit `870c145` - "[DevIndex] Add Hireable and Website columns to Grid #9152 wip"
- 2026-02-14T17:43:20Z @tobiu referenced in commit `9366dc7` - "feat(devindex): Add Hireable and Website columns to Grid (#9152)

- Introduce generic Icon and IconLink components with full SCSS theme support
- Implement 'hideMode: visibility' for icon columns to optimize grid scrolling (avoids DOM thrashing)
- Add 'contain: layout paint style' to icons for rendering performance
- Refactor DevIndex grid to use 'cellCls' and CSS variables for theme-aware styling
- Add dark/light theme variables for new columns"
### @tobiu - 2026-02-14T17:44:14Z

**Input from Gemini 3 Pro:**

> ✦ Completed the addition of Hireable and Website columns to the DevIndex Grid.
> 
> **Key Changes:**
> *   **Columns:** Added 'Website' (icon link), 'LinkedIn' (icon link), and 'Hireable' (icon status) columns.
> *   **Performance:**
>     *   Implemented `hideMode: 'visibility'` for icons to prevent DOM thrashing during scrolling.
>     *   Applied `contain: layout paint style` to icons to minimize reflows.
> *   **Theming:**
>     *   Replaced inline styles with `cellCls` and CSS variables.
>     *   Added full support for `neo-dark` and `neo-light` themes with specific hover states for better contrast.
> *   **Refactoring:** Cleaned up `GridContainer.mjs` to use the new CSS classes.

- 2026-02-14T17:44:38Z @tobiu closed this issue

