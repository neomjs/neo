---
id: 9009
title: Extract GitHubUser and CountryFlag Grid Columns
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-02-06T00:45:45Z'
updatedAt: '2026-02-06T01:13:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9009'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-06T01:10:27Z'
---
# Extract GitHubUser and CountryFlag Grid Columns

Extract the `UserCell` and `LocationCell` components from the DevRank app into reusable Grid Columns in the framework core, as suggested.

1.  **Create Components:**
    *   `src/grid/column/GitHubUser.mjs` (Column definition)
    *   `src/component/GitHubUser.mjs` (Cell component logic, moved from `UserCell.mjs`)
    *   `src/grid/column/CountryFlag.mjs` (Column definition)
    *   `src/component/CountryFlag.mjs` (Cell component logic, moved from `LocationCell.mjs`)

2.  **Move Styles:**
    *   Extract SCSS from `resources/scss/src/apps/devrank/GridContainer.scss`.
    *   Create `resources/scss/src/grid/column/GitHubUser.scss`.
    *   Create `resources/scss/src/grid/column/CountryFlag.scss`.

3.  **Update DevRank:**
    *   Refactor `apps/devrank/view/GridContainer.mjs` to use the new framework columns.
    *   Delete local `UserCell.mjs` and `LocationCell.mjs`.

## Timeline

- 2026-02-06T00:45:47Z @tobiu added the `enhancement` label
- 2026-02-06T00:45:47Z @tobiu added the `ai` label
- 2026-02-06T00:45:47Z @tobiu added the `refactoring` label
- 2026-02-06T00:45:47Z @tobiu added the `core` label
- 2026-02-06T01:09:18Z @tobiu assigned to @tobiu
- 2026-02-06T01:09:30Z @tobiu referenced in commit `0e66066` - "feat(core): Extract GitHubUser and CountryFlag columns (#9009)"
### @tobiu - 2026-02-06T01:09:51Z

**Input from Gemini 3 Pro:**

> ✦ Extracted `UserCell` and `LocationCell` from DevRank into core framework components:
> - `Neo.component.GitHubUser`
> - `Neo.component.CountryFlag`
> 
> Registered corresponding Grid Columns in `Neo.grid.Container.columnTypes`:
> - `githubUser` -> `Neo.grid.column.GitHubUser`
> - `countryFlag` -> `Neo.grid.column.CountryFlag`
> 
> Refined implementation:
> - Components use `baseCls` for better extensibility.
> - SCSS files moved to `resources/scss/src/component/` with alphabetically sorted properties.
> - DevRank `GridContainer` updated to use the new column types.

- 2026-02-06T01:10:27Z @tobiu closed this issue
- 2026-02-06T01:12:51Z @tobiu referenced in commit `71a1c71` - "cleanup(devrank): Remove obsolete cell components and styles (#9009)"
### @tobiu - 2026-02-06T01:13:37Z

**Input from Gemini 3 Pro:**

> ✦ Pushed cleanup commit: Removed obsolete `UserCell.mjs`, `LocationCell.mjs` and cleaned up `GridContainer.scss`.


