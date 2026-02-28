---
id: 9097
title: 'Feat: Include Repository Creations in DevRank Contributions'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-10T20:29:46Z'
updatedAt: '2026-02-10T20:32:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9097'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T20:32:11Z'
---
# Feat: Include Repository Creations in DevRank Contributions

## Objective
Update the DevRank `Updater.mjs` service to include `totalRepositoryContributions` in the total contribution count (`tc`).

## Problem
We recently observed a significant drop in contribution counts for prolific authors (e.g., `pydanny` dropped from ~21k to ~16k). This regression occurred when we switched from the expensive `contributionCalendar` query to summing lightweight counters.

**Root Cause:**
The current `Updater` sums:
-   `totalCommitContributions`
-   `totalIssueContributions`
-   `totalPullRequestContributions`
-   `totalPullRequestReviewContributions`

It **omits** `totalRepositoryContributions` (creating new repos). For active maintainers who create many projects/forks, this is a significant "Merit" metric that we are currently discarding.

## Solution
1.  **GraphQL:** Add `totalRepositoryContributions` to the `contributionsCollection` query in `Updater.mjs`.
2.  **Aggregation:** Add this value to the yearly sum (`val`) and the total count (`total`).

## Expected Outcome
Contribution counts should increase, recovering some of the "lost" merit from the refactor, without re-introducing the performance cost of the calendar query.


## Timeline

- 2026-02-10T20:29:47Z @tobiu added the `enhancement` label
- 2026-02-10T20:29:47Z @tobiu added the `ai` label
- 2026-02-10T20:30:15Z @tobiu added parent issue #8930
- 2026-02-10T20:31:39Z @tobiu referenced in commit `88c1e26` - "feat: Include totalRepositoryContributions in DevRank metrics (#9097)"
### @tobiu - 2026-02-10T20:31:48Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the `Updater.mjs` logic to include `totalRepositoryContributions`.
> 
> ### Changes
> 1.  **GraphQL Query:** Added `totalRepositoryContributions` to the `contributionsCollection` request for each year.
> 2.  **Aggregation:** Updated the summing logic to include this value in the total (`tc`) and yearly (`y`) counts.
> 
> This will effectively "recover" merit for users who create many repositories (e.g. library authors) without incurring the cost of the daily calendar query.
> 

- 2026-02-10T20:32:11Z @tobiu closed this issue
- 2026-02-10T20:32:25Z @tobiu assigned to @tobiu

