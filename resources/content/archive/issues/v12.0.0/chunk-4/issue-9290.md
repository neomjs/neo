---
id: 9290
title: Refactor DevIndex data deployment strategy to prevent huge resource duplication
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-02-24T15:54:09Z'
updatedAt: '2026-02-24T15:57:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9290'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-24T15:57:17Z'
---
# Refactor DevIndex data deployment strategy to prevent huge resource duplication

### Problem
The `apps/devindex/resources` folder contains heavy data files, notably the `users.jsonl` file which is currently 22MB. When building the project for `dist/development` and `dist/production` environments, the build scripts (`buildScripts/webpack/...` and `buildScripts/build/esmodules.mjs`) blindly copy everything in the `resources` directory. 

This leads to significant, unnecessary duplication of heavy data files in the deployment artifacts. Furthermore, the backend data factory needs a single source of truth (the `dev` branch data) to act upon.

### Solution
1. Move the data files (`*.json`, `*.jsonl`) within `apps/devindex/resources` into a dedicated `data/` subdirectory (`apps/devindex/resources/data`).
2. Update the backend data factory config (`apps/devindex/services/config.mjs`) to point to the new `data/` paths.
3. Update the `Contributors.mjs` store proxy URL to fetch data from `Neo.config.basePath + 'apps/devindex/resources/data/users.jsonl'`. This ensures that `dist` environments correctly resolve the path back to the original source folder, enabling them to pull data from the dev environment as the single source of truth.
4. Modify the resource copying logic in the build scripts (`webpack.config.appworker.mjs` for dev and prod, and `esmodules.mjs`) to explicitly remove the `data` directory from `apps/devindex/resources` after the initial copy, preventing the heavy files from being deployed to `dist/`.

## Timeline

- 2026-02-24T15:54:11Z @tobiu added the `enhancement` label
- 2026-02-24T15:54:11Z @tobiu added the `ai` label
- 2026-02-24T15:54:11Z @tobiu added the `build` label
- 2026-02-24T15:55:51Z @tobiu referenced in commit `04a30f4` - "build: Refactor DevIndex data deployment strategy (#9290)"
- 2026-02-24T15:56:39Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-24T15:56:51Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully moved the `*.json` and `*.jsonl` files from `apps/devindex/resources` to `apps/devindex/resources/data`. The `config.mjs` has been updated to point to the new paths, and the `Contributors.mjs` store now fetches the `users.jsonl` data correctly using `Neo.config.basePath`.
> 
> I have also updated the build scripts (`buildScripts/webpack/production/webpack.config.appworker.mjs`, `buildScripts/webpack/development/webpack.config.appworker.mjs`, and `buildScripts/build/esmodules.mjs`) with an explicit exception for the DevIndex app. The scripts now remove the `data` directory from the copied `resources` folder, preventing the 22MB `users.jsonl` and other data files from being duplicated in the `dist` builds.
> 
> The changes have been pushed to the `dev` branch.

- 2026-02-24T15:57:18Z @tobiu closed this issue

