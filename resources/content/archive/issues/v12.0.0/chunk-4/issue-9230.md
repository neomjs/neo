---
id: 9230
title: 'DevIndex: Implement Star-Based Opt-Out Service (OptOut.mjs)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-21T15:23:32Z'
updatedAt: '2026-02-21T15:30:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9230'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-21T15:30:16Z'
---
# DevIndex: Implement Star-Based Opt-Out Service (OptOut.mjs)

### Description
Implement a privacy-focused "stealth" opt-out mechanism for the DevIndex application. Users who star a specific repository (e.g., `neomjs/devindex-opt-out`) should be automatically removed from the index.

### Requirements
1. **New Service (`apps/devindex/services/OptOut.mjs`)**:
   - Query the GraphQL API for stargazers of the designated opt-out repository.
   - Request stargazers sorted by `STARRED_AT` descending, fetching up to 100 per page.
   - Support pagination (using `endCursor`) to fetch subsequent pages if a large spike occurs until `starredAt` is older than `lastCheck`.
2. **State Tracking**:
   - Store the timestamp of the last processed star in a new file (e.g., `apps/devindex/data/optout-sync.json`).
3. **Blacklisting Logic**:
   - Add newly discovered stargazers to `apps/devindex/data/blacklist.json`.
   - Remove them from the rich data store (`users.jsonl`), `tracker.json`, and `failed.json`.
4. **Pipeline Integration**:
   - Run this new `OptOut.mjs` service at the beginning of the `devindex-pipeline.yml` workflow.

## Timeline

- 2026-02-21T15:23:34Z @tobiu added the `enhancement` label
- 2026-02-21T15:23:34Z @tobiu added the `ai` label
- 2026-02-21T15:24:34Z @tobiu assigned to @tobiu
- 2026-02-21T15:29:42Z @tobiu referenced in commit `596f4df` - "feat(devindex): Implement Star-Based Opt-Out Service (#9230)"
### @tobiu - 2026-02-21T15:29:45Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully implemented the Star-Based Opt-Out Service.
> 
> ### Changes Made:
> - **`apps/devindex/services/OptOut.mjs`**: Created a new service that queries the GraphQL API for stargazers of the `neomjs/devindex-opt-out` repository. It fetches them in batches of 100, sorted by `STARRED_AT` descending, and stops when it reaches previously processed timestamps.
> - **`apps/devindex/services/Storage.mjs`**: Added methods `getOptOutSync`, `saveOptOutSync`, and `addToBlacklist` to persist state and update the blocklist. Integrated the timestamp sync file into the startup routines.
> - **`apps/devindex/services/Manager.mjs` & `package.json`**: Exposed the new service via the `npm run devindex:optout` command.
> - **`.github/workflows/devindex-pipeline.yml`**: Added the `Run DevIndex Opt-Out` step to run right before the Spider loop, ensuring clean data during the discovery run.
> 
> The tests have run correctly, catching `NOT_FOUND` cleanly, so the repo does not even have to exist yet to prevent crashes. Closing this ticket as completed.

- 2026-02-21T15:30:17Z @tobiu closed this issue
- 2026-02-21T15:31:53Z @tobiu referenced in commit `255abdc` - "chore(devindex): Add optout-sync.json (#9230)"

