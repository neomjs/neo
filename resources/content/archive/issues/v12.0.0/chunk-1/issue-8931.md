---
id: 8931
title: 'Feat: DevRank Scaffolding & Data PoC'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-01T15:20:20Z'
updatedAt: '2026-02-01T15:22:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8931'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-01T15:22:31Z'
---
# Feat: DevRank Scaffolding & Data PoC

To initiate the DevRank project, we need to set up the basic application structure and prove the viability of the data fetching strategy.

### Tasks
1.  **App Scaffolding:** Create the `apps/devrank` directory with standard Neo.mjs app structure (`app.mjs`, `index.html`, `neo-config.json`).
2.  **Model & Store:** Define `DevRank.model.Contributor` and `DevRank.store.Contributors`.
3.  **PoC Script:** Refine `apps/devrank/services/gh_discovery.mjs` to robustly fetch "One-Shot" contribution data for a seed list of users.
4.  **Initial Data:** Generate a preliminary `resources/data.json` with real data from top repositories to populate the prototype.

### Acceptance Criteria
- `apps/devrank` exists and is a valid Neo.mjs app.
- `gh_discovery.mjs` can be run to update `resources/data.json`.
- The Store can load the generated JSON.


## Timeline

- 2026-02-01T15:20:21Z @tobiu added the `enhancement` label
- 2026-02-01T15:20:21Z @tobiu added the `ai` label
- 2026-02-01T15:20:36Z @tobiu added parent issue #8930
- 2026-02-01T15:21:44Z @tobiu referenced in commit `59a43a5` - "feat: DevRank Scaffolding & Data PoC (#8931)"
- 2026-02-01T15:21:59Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-01T15:22:06Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully scaffolded the basic structure for the DevRank application and verified the data fetching strategy.
> 
> ### Completed Actions
> 1.  **App Structure:** Created `apps/devrank` with `app.mjs`, `index.html`, and `neo-config.json`.
> 2.  **Model & Store:** Defined `DevRank.model.Contributor` and `DevRank.store.Contributors` to handle the data.
> 3.  **Discovery Service:** Implemented `apps/devrank/services/gh_discovery.mjs`, a Node.js script that:
>     - Scans top repositories (currently >20k stars for the PoC).
>     - Fetches top contributors.
>     - Performs a "Deep Scan" (One-Shot GraphQL) to get all-time contribution history.
>     - Saves the results to `apps/devrank/resources/data.json`.
> 4.  **Initial Data:** Generated a sample dataset containing 46 top contributors (including `tobiu` with 29,516 contributions) to seed the application.
> 5.  **Git Integration:** Updated `.gitignore` to whitelist the new app and committed all changes to the `dev` branch.
> 
> ### Next Steps
> The foundational data pipeline is proven. The next phase will focus on implementing the "Spider" algorithm to expand discovery beyond top repositories and building the actual UI to visualize this data.

- 2026-02-01T15:22:31Z @tobiu closed this issue

