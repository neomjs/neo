---
id: 9065
title: 'Feat: Persist Yearly Commits Array in DevRank Data'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2026-02-08T23:58:59Z'
updatedAt: '2026-02-09T00:44:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9065'
author: tobiu
commentsCount: 2
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-09T00:00:39Z'
---
# Feat: Persist Yearly Commits Array in DevRank Data

Refactor the `Updater` service to persist a secondary array containing only commit counts per year.

**Current State:**
The `users.json` schema stores `y: [int]` which represents *total* contributions (commits + issues + PRs + reviews).

**New State:**
Add a new field `cy: [int]` ("Commit Years") to store the specific commit counts. This data is already being fetched via the recent "Lightweight Counters" refactor (#9063), so we just need to capture and store it.

**Task:**
1.  Update `apps/devrank/services/Updater.mjs` to aggregate `commitsArr` alongside `yearsArr`.
2.  Add `cy` to the minified output object.
3.  (Optional) Update `Contributor` model to map this new field.

## Timeline

- 2026-02-08T23:59:00Z @tobiu added the `enhancement` label
- 2026-02-08T23:59:51Z @tobiu referenced in commit `cd03882` - "Feat: Persist Yearly Commits Array in DevRank Data (#9065)"
### @tobiu - 2026-02-09T00:00:05Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the backend changes to persist the yearly commits array.
> 
> **Changes in `Updater.mjs`:**
> -   Introduced `commitsArr` to track `totalCommitContributions` per year.
> -   Added `cy` field to the minified user object, containing this array.
> 
> Now, every user updated will have both `y` (Total Contributions) and `cy` (Commits Only) arrays.
> 
> Example payload:
> ```json
> {
>   "l": "tobiu",
>   "tc": 29876,
>   "fy": 2011,
>   "y": [0, 0, ...], // Total
>   "cy": [0, 0, ...] // Commits
> }
> ```

- 2026-02-09T00:00:18Z @tobiu assigned to @tobiu
- 2026-02-09T00:00:36Z @tobiu added parent issue #8930
- 2026-02-09T00:00:39Z @tobiu closed this issue
### @tobiu - 2026-02-09T00:44:36Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the backend implementation for persisting the yearly commits array.
> 
> **Changes:**
> -   Updated `apps/devrank/services/Updater.mjs` to extract `totalCommitContributions` from the GitHub GraphQL response.
> -   Aggregated these counts into a new `cy` (Commit Years) array in the minified user object.
> -   Verified that the `users.json` output now includes this field for updated records.
> 
> This data is now available for the frontend to consume.


