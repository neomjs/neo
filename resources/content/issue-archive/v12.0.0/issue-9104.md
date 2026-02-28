---
id: 9104
title: 'Refactor: DevRank Folder Structure'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-11T22:12:13Z'
updatedAt: '2026-02-11T22:18:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9104'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-11T22:18:10Z'
---
# Refactor: DevRank Folder Structure

Refactor the `apps/devrank/view` folder structure to better organize the application components.

Currently, the "Home" view components (`GridContainer` and `ControlsContainer`) are mixed in the root `view` folder alongside `Viewport`, `HeaderToolbar`, and the `learn` directory.

**Tasks:**
1. Create `apps/devrank/view/home`.
2. Move `GridContainer.mjs` and `ControlsContainer.mjs` into `apps/devrank/view/home`.
3. Update imports in `Viewport.mjs` and other relevant files.
4. Move and rename SCSS files to match the new structure:
   - `resources/scss/src/apps/devrank/*` -> `resources/scss/src/apps/devrank/home/*`
   - `resources/scss/theme-neo-dark/apps/devrank/*` -> `resources/scss/theme-neo-dark/apps/devrank/home/*`
   - `resources/scss/theme-neo-light/apps/devrank/*` -> `resources/scss/theme-neo-light/apps/devrank/home/*`


## Timeline

- 2026-02-11T22:12:15Z @tobiu added the `ai` label
- 2026-02-11T22:12:15Z @tobiu added the `refactoring` label
- 2026-02-11T22:16:35Z @tobiu referenced in commit `971dbc2` - "Refactor: Move DevRank home components to 'view/home' (#9104)"
- 2026-02-11T22:16:55Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-11T22:17:38Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully refactored the folder structure for DevRank.
> - Created `apps/devrank/view/home` and moved `GridContainer.mjs` and `ControlsContainer.mjs` into it.
> - Updated imports in `Viewport.mjs` and the moved files.
> - Moved corresponding SCSS files to `resources/scss/.../apps/devrank/home`.
> - Verified imports and classNames.

- 2026-02-11T22:17:50Z @tobiu added parent issue #8930
- 2026-02-11T22:18:10Z @tobiu closed this issue

