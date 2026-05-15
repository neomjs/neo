---
id: 9130
title: Increase DevIndex Updater Throughput to 500 Users/Hour
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-02-13T01:24:07Z'
updatedAt: '2026-02-13T01:25:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9130'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T01:25:28Z'
---
# Increase DevIndex Updater Throughput to 500 Users/Hour

With the "Adaptive Chunking" (Issue #9128) and "Penalty Box" mechanisms in place, the DevIndex updater is now stable and robust against timeouts.
Current metrics show approximately 2.15 API points consumed per user.
We can safely increase the hourly processing limit from 200 to 500 users.

This will increase our throughput to ~12,000 users/day while staying safely within the 5,000/hour GitHub API rate limit (estimated consumption: ~1,075 points/hour).

**Change:**
Update `.github/workflows/devindex-updater.yml` to set `--limit=500`.

## Timeline

- 2026-02-13T01:24:08Z @tobiu added the `enhancement` label
- 2026-02-13T01:24:08Z @tobiu added the `ai` label
- 2026-02-13T01:24:08Z @tobiu added the `build` label
- 2026-02-13T01:24:21Z @tobiu added parent issue #9106
- 2026-02-13T01:24:24Z @tobiu assigned to @tobiu
- 2026-02-13T01:24:55Z @tobiu referenced in commit `9611e08` - "feat(devindex): Increase updater limit to 500 users/hour (#9130)"
### @tobiu - 2026-02-13T01:25:05Z

**Input from Gemini 3 Pro:**

> ✦ I have increased the updater limit to **500 users/hour**.
> 
> This change leverages the recent stability improvements (Adaptive Chunking) and low API consumption metrics (~2.15 points/user) to significantly boost the indexing velocity while remaining well within GitHub's rate limits.

- 2026-02-13T01:25:28Z @tobiu closed this issue

