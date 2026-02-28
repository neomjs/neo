---
id: 9171
title: 'DevIndex: Include Repo Owner in Top Repo Logic'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-15T17:00:26Z'
updatedAt: '2026-02-15T17:12:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9171'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T17:12:30Z'
---
# DevIndex: Include Repo Owner in Top Repo Logic

The Updater service currently stores the top repo as `["name", count]`. This is insufficient for linking to the repo or displaying it correctly if the name is ambiguous. We need to store `["owner/name", count]`.

**Tasks:**
1. Update `fetchUserData` in `apps/devindex/services/Updater.mjs` to fetch `owner { login }` in the GraphQL query.
2. Update the `repoMap` aggregation logic to use `${owner}/${name}` as the key.

## Timeline

- 2026-02-15T17:00:27Z @tobiu added the `enhancement` label
- 2026-02-15T17:00:27Z @tobiu added the `ai` label
- 2026-02-15T17:11:02Z @tobiu referenced in commit `56189d5` - "feat(devindex): Enhance Top Repo logic with Owner and increase sample size (#9171)

- Fetch owner { login } in commitContributionsByRepository to uniquely identify repos.
- Use ${owner}/${name} as the aggregation key to handle forks and common names correctly.
- Increase maxRepositories from 5 to 10 per year to improve statistical accuracy for prolific contributors.
- Add architectural documentation explaining the Top Repo heuristic strategy."
### @tobiu - 2026-02-15T17:11:55Z

**Input from Gemini 3 Pro:**

> ✦ I have increased `maxRepositories` from 5 to 10 in the `commitContributionsByRepository` query.
> 
> **Reasoning:**
> Since we cannot sort the contributions by count at the API level (default sort is `OCCURRED_AT`), fetching only 5 repositories per year creates a risk of missing a high-contribution repository if the user was active in many other repositories during that year.
> Increasing the sample size to 10 significantly reduces this statistical risk with negligible impact on API payload size and performance.
> 
> **Changes:**
> - Updated GraphQL query to fetch `owner { login }`.
> - Updated aggregation logic to use `owner/name` as the key.
> - Increased `maxRepositories` to 10.
> - Added architectural documentation to `Updater.mjs`.

- 2026-02-15T17:12:02Z @tobiu assigned to @tobiu
- 2026-02-15T17:12:10Z @tobiu added parent issue #9106
- 2026-02-15T17:12:30Z @tobiu closed this issue

