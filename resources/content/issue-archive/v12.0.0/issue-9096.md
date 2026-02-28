---
id: 9096
title: 'Feat: GitHub API Secondary Rate Limit Handling & Concurrency Tuning'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-10T20:09:20Z'
updatedAt: '2026-02-11T14:02:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9096'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T20:22:15Z'
---
# Feat: GitHub API Secondary Rate Limit Handling & Concurrency Tuning

## Objective
Enhance the stability of the DevRank Updater service by implementing smarter handling for GitHub's Secondary Rate Limits (403 Forbidden / Abuse Detection) and tuning concurrency.

## Problem
The Updater is experiencing sporadic bursts of 403 errors despite having plenty of primary API quota remaining (e.g., 4700/5000). This indicates we are triggering GitHub's "Abuse Detection" or "Secondary Rate Limit" due to high concurrency (10 parallel requests) or complex GraphQL queries.

## Tasks
1.  **Tune Concurrency:** Reduce `Updater.mjs` concurrency from 10 to 5. This is a safer baseline for complex GraphQL fetching.
2.  **Smart 403 Handling:** Update `GitHub.mjs`:
    -   Inspect headers on 403. If `x-ratelimit-remaining > 0`, treat it as a Secondary Limit.
    -   Implement a specific backoff strategy for Secondary Limits (e.g., wait 30s-60s) instead of the standard short retry.
    -   Log a distinct warning ("Abuse Detection triggered") to differentiate from quota exhaustion.

## References
-   [GitHub Docs: Secondary Rate Limits](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#secondary-rate-limits)


## Timeline

- 2026-02-10T20:09:21Z @tobiu added the `enhancement` label
- 2026-02-10T20:09:22Z @tobiu added the `ai` label
- 2026-02-10T20:09:45Z @tobiu added parent issue #8930
- 2026-02-10T20:20:49Z @tobiu referenced in commit `699b488` - "feat: Enhance GitHub API Concurrency and Rate Limit Handling (#9096)"
### @tobiu - 2026-02-10T20:21:52Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the concurrency tuning and smart rate limit handling.
> 
> ### Changes
> 1.  **`Updater.mjs`**: Set concurrency to **8**. This is a balanced middle ground between the previous aggressive 10 and conservative 5.
> 2.  **`GitHub.mjs`**: Implemented smart 403 detection. If `x-ratelimit-remaining > 0` (indicating secondary limit/abuse detection), the service now logs a warning and backs off for **10 seconds** before retrying. This allows the pipeline to "dance" with the API limits rather than crashing or crawling.
> 
> This should stabilize the data enrichment process while maintaining high throughput.
> 

- 2026-02-10T20:22:16Z @tobiu closed this issue
- 2026-02-11T14:02:37Z @tobiu assigned to @tobiu

