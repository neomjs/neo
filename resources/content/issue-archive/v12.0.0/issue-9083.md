---
id: 9083
title: 'Feat: DevRank GitHub API Rate Limit Protection'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-10T13:54:36Z'
updatedAt: '2026-02-10T13:58:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9083'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T13:58:14Z'
---
# Feat: DevRank GitHub API Rate Limit Protection

Implement rate limit tracking and graceful shutdown for the DevRank backend services (`Updater`, `Spider`).

**Requirements:**
1.  **Header Inspection:** Update `DevRank.services.GitHub` to extract `x-rate-limit-remaining` and `x-rate-limit-reset` headers from every API response (GraphQL and REST).
2.  **State Tracking:** Expose the current rate limit status via the `GitHub` service.
3.  **Graceful Shutdown:** Update `Updater` and `Spider` to check the rate limit after processing batches/repositories.
    - If `remaining` < threshold (e.g., 50), stop processing.
    - Save all pending data (checkpoints).
    - Log a clear message about the limit and reset time.
4.  **Logging:** Log the remaining rate limit periodically to the console for monitoring.

This will prevent "API rate limit exceeded" errors and ensure we don't lose data when hitting the wall.

## Timeline

- 2026-02-10T13:54:37Z @tobiu added the `enhancement` label
- 2026-02-10T13:54:37Z @tobiu added the `ai` label
- 2026-02-10T13:54:52Z @tobiu added parent issue #8930
- 2026-02-10T13:54:56Z @tobiu assigned to @tobiu
- 2026-02-10T13:57:48Z @tobiu referenced in commit `d51e59a` - "Feat: Implement GitHub API Rate Limit Protection (#9083)"
### @tobiu - 2026-02-10T13:57:51Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the rate limit protection logic:
> 
> 1.  **DevRank.services.GitHub:** Now parses `x-rate-limit-remaining`, `reset`, and `limit` headers from every GraphQL and REST response.
> 2.  **DevRank.services.Updater:** Checks the rate limit before processing each batch chunk. If remaining < 50, it stops processing, saves the checkpoint, and logs a warning with the reset time.
> 3.  **DevRank.services.Spider:** Similarly checks the rate limit during search paging and repository processing to prevent quota exhaustion during discovery runs.
> 
> This should prevent the "API rate limit already exceeded" errors by proactively shutting down the services when the limit is approached.

- 2026-02-10T13:58:14Z @tobiu closed this issue

