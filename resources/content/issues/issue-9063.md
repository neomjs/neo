---
id: 9063
title: 'Perf: Refactor Updater to use Lightweight Contribution Counters'
state: OPEN
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-08T23:10:32Z'
updatedAt: '2026-02-08T23:11:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9063'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Perf: Refactor Updater to use Lightweight Contribution Counters

The current `Updater` fetches `contributionCalendar { totalContributions }` for every year of a user's history. This forces GitHub to compute the daily contribution graph, leading to frequent **502 Bad Gateway** errors and slow performance.

**Optimization:**
Replace `contributionCalendar` with the lightweight aggregated counters available directly on `contributionsCollection`:
- `totalCommitContributions`
- `totalIssueContributions`
- `totalPullRequestContributions`
- `totalPullRequestReviewContributions`
- `restrictedContributionsCount` (optional check)

**Logic:**
`Yearly Total = Sum(Counters)`

**Benefits:**
1.  **Stability:** Drastically reduces load on GitHub's GraphQL API, eliminating 502 errors.
2.  **Performance:** Significantly faster data fetching.
3.  **Future-Proofing:** Opens the door to tracking "Commits vs. Total" metrics separately in the future.

## Timeline

- 2026-02-08T23:10:33Z @tobiu added the `enhancement` label
- 2026-02-08T23:10:33Z @tobiu added the `ai` label
- 2026-02-08T23:10:34Z @tobiu added the `performance` label
- 2026-02-08T23:11:34Z @tobiu assigned to @tobiu

