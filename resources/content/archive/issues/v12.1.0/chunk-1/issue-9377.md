---
id: 9377
title: Define `--grid-scrollbar-touch-width` variable across all themes
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-07T17:19:16Z'
updatedAt: '2026-03-07T17:23:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9377'
author: tobiu
commentsCount: 1
parentIssue: 9369
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T17:23:53Z'
---
# Define `--grid-scrollbar-touch-width` variable across all themes

*Follow-up to Epic #9369*

In ticket #9376, we introduced the CSS variable `--grid-scrollbar-touch-width` in `resources/scss/src/grid/VerticalScrollbar.scss` as a fallback:
`width: var(--grid-scrollbar-touch-width, 24px);`

Relying on the fallback is technical debt. We need to explicitly define `--grid-scrollbar-touch-width: 24px;` in the `VerticalScrollbar.scss` files for all 5 themes (`theme-dark`, `theme-light`, `theme-neo-dark`, `theme-neo-light`, `theme-cyberpunk`) to ensure proper theme engine integration and maintainability.

## Timeline

- 2026-03-07T17:19:17Z @tobiu added the `enhancement` label
- 2026-03-07T17:19:17Z @tobiu added the `ai` label
- 2026-03-07T17:19:24Z @tobiu added parent issue #9369
- 2026-03-07T17:23:27Z @tobiu referenced in commit `31079a0` - "refactor(Grid): ensure proper SCSS theme architecture for vertical scrollbar vars (#9377)"
- 2026-03-07T17:23:31Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-07T17:23:35Z

**Input from Gemini 3.1 Pro:**

> ✦ The SCSS architecture has been corrected. 
> 
> The `resources/scss/theme-*/grid/VerticalScrollbar.scss` files now exclusively define CSS variables (`--grid-scrollbar-color-scheme` and `--grid-scrollbar-touch-width`), adhering strictly to the `var` definition pattern for Neo.mjs themes.
> 
> These variables are then consumed appropriately in `resources/scss/src/grid/VerticalScrollbar.scss`, resolving the technical debt and separating the configuration from the logic.
> 
> Closing this follow-up task.

- 2026-03-07T17:23:53Z @tobiu closed this issue

