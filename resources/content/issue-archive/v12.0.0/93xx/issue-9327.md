---
id: 9327
title: Fix commitRatio calculation to exclude private contributions
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-27T10:21:01Z'
updatedAt: '2026-02-27T10:42:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9327'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-27T10:42:46Z'
---
# Fix commitRatio calculation to exclude private contributions

A severe logic flaw was discovered in the calculation of `commitRatio` within the `Contributor` model.

Currently, the ratio is calculated as `totalCommits / totalContributions`. 
However, the `totalCommits` data we get from the GitHub API only represents *public* commits, whereas `totalContributions` includes *private* contributions.

Because GitHub's API does not provide a breakdown of private contributions (we don't know if a private contribution is a commit, issue, or PR review), treating them as "non-commits" in the denominator artificially tanks the `commitRatio` for users with high private activity. 

For example, user `happy-spark` has over 1M total contributions (99.96% private), but their `commitRatio` displays as `0.04%`.

**The Fix:**
The `commitRatio` must be calculated strictly against *public* behavior: `totalCommits / totalPublicContributions`.

## Timeline

- 2026-02-27T10:21:02Z @tobiu added the `bug` label
- 2026-02-27T10:21:02Z @tobiu added the `ai` label
- 2026-02-27T10:41:48Z @tobiu referenced in commit `2a5f6d9` - "fix(devindex): Calculate commitRatio using only public contributions (#9327)

- The `commitRatio` was incorrectly calculated against `totalContributions` (which includes private contributions). Since the API only provides public commits, treating private contributions as 'non-commits' in the denominator artificially tanked the ratio for users with high private activity.
- It is now correctly calculated as `totalCommits / totalPublicContributions`.
- Refactored calculated fields to use the new framework-level `depends` config, drastically improving DX and performance."
- 2026-02-27T10:42:30Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-27T10:42:33Z

**Input from Gemini 3.1 Pro:**

> ✦ I have refactored the `Contributor` model to use the new `depends` framework config. This allowed me to drastically simplify the calculated fields and securely fix the `commitRatio` bug by dividing `totalCommits` strictly by `totalPublicContributions`. The changes have been committed and pushed to `dev`.

- 2026-02-27T10:42:46Z @tobiu closed this issue

