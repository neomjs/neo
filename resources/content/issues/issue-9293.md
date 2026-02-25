---
id: 9293
title: Add push synchronization step for DevIndex data to pages repo
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-02-24T16:51:24Z'
updatedAt: '2026-02-24T16:55:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9293'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-24T16:55:55Z'
---
# Add push synchronization step for DevIndex data to pages repo

### Problem
The DevIndex data (`users.jsonl`) is generated and maintained within the `neomjs/neo` repository's automated hourly pipeline to ensure privacy and provide a single source of truth. However, the production deployment lives in the `neomjs/pages` repository. Currently, the data does not automatically sync to the `pages` repository, meaning the deployed application does not immediately reflect updates (such as opt-outs or new discovered users).

### Solution
Append a new step to the `.github/workflows/devindex-pipeline.yml` workflow. After the pipeline finishes processing and committing the local data, it will use a Personal Access Token (`PAGES_DEPLOY_PAT`) to clone the `neomjs/pages` repository, copy the newly updated `users.jsonl` file into `node_modules/neo.mjs/apps/devindex/resources/data/`, and push the changes directly to the `pages` repo's `main` branch. 

This ensures a near real-time "Push" synchronization strategy where the frontend application immediately benefits from the data factory's backend updates.

## Timeline

- 2026-02-24T16:51:26Z @tobiu added the `enhancement` label
- 2026-02-24T16:51:26Z @tobiu added the `ai` label
- 2026-02-24T16:51:26Z @tobiu added the `build` label
- 2026-02-24T16:55:08Z @tobiu referenced in commit `3e50e14` - "build: Add push synchronization step for DevIndex data to pages repo (#9293)"
- 2026-02-24T16:55:32Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-24T16:55:38Z

**Input from Gemini 3.1 Pro:**

> ✦ I have successfully appended a new "Push Data to neomjs/pages" step to the `devindex-pipeline.yml` workflow.
> 
> As requested, it uses the standard `secrets.GITHUB_TOKEN` to clone the `neomjs/pages` repository, create the necessary nested directory structure (`node_modules/neo.mjs/apps/devindex/resources/data`), copy the updated `users.jsonl` file, and commit/push it directly to the `pages` repository's `main` branch.
> 
> **Security Note:** While both repositories are in the same organization, GitHub Actions scopes the default `GITHUB_TOKEN` to the repository running the action (i.e., `neomjs/neo`). Unless cross-repository access is explicitly enabled for Actions at the organization level, the push step may fail with a 403 error during the next run. If it does fail, we will need to revert to using a Personal Access Token (`PAGES_DEPLOY_PAT`).
> 
> The change has been committed and pushed to `dev`.

- 2026-02-24T16:55:55Z @tobiu closed this issue

