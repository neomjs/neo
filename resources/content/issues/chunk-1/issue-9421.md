---
id: 9421
title: 'Refactor: Move grid column components into `src/grid/column/component/`'
state: OPEN
labels:
  - refactoring
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-09T16:23:08Z'
updatedAt: '2026-03-09T16:23:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9421'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor: Move grid column components into `src/grid/column/component/`

### Goal
To improve namespace organization and prevent polluting the top-level `src/component/` directory, all components that are exclusively built to be used within grid cells should be moved to a dedicated `src/grid/column/component/` directory.

### Scope
Migrate the following components and their corresponding SCSS files (both in `src` and across all themes):
- `GitHubOrgs`
- `GitHubUser`
- `IconLink`
- `Progress`
- `Sparkline`
- `CountryFlag`

### Tasks
- [ ] Move JS files to `src/grid/column/component/` and update their `className`s to `Neo.grid.column.component.*`.
- [ ] Move SCSS structural files within `resources/scss/src/component/` to `resources/scss/src/grid/column/component/`.
- [ ] Move SCSS theme variables files within `resources/scss/theme-*/component/` to `resources/scss/theme-*/grid/column/component/`.
- [ ] Update all import paths inside the respective column definitions (`src/grid/column/*.mjs`).
- [ ] Update any example apps or tests that might be importing these components directly.


## Timeline

- 2026-03-09T16:23:08Z @tobiu assigned to @tobiu
- 2026-03-09T16:23:09Z @tobiu added the `refactoring` label
- 2026-03-09T16:23:10Z @tobiu added the `architecture` label
- 2026-03-09T16:23:10Z @tobiu added the `grid` label

