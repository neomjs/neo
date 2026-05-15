---
id: 7862
title: Add capability to force summarize all sessions (ignoring 30-day limit)
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-22T18:36:58Z'
updatedAt: '2025-11-22T18:53:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7862'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-22T18:53:11Z'
---
# Add capability to force summarize all sessions (ignoring 30-day limit)

Current `SessionService` limits automatic summarization to sessions active in the last 30 days for performance. We need a manual override to summarize ALL sessions, including ancient ones (e.g. > 30 days old) that might have been missed or need a refresh.

**Tasks:**
1.  **Update `openapi.yaml`:**
    -   Add `includeAll` (boolean, default false) parameter to the `summarize_sessions` tool definition.
    -   Update description to clarify the default 30-day behavior vs. the full scan.

2.  **Update `SessionService.mjs`:**
    -   Update `summarizeSessions` method signature to accept `includeAll`.
    -   Update `findSessionsToSummarize` to accept `includeAll`.
    -   **Logic Change:** If `includeAll` is true, remove the `where: { timestamp: { $gt: ... } }` clause from both Memory and Summary queries.
    -   **Pagination:** Ensure pagination loop handles the potentially much larger dataset correctly (already implemented, but verify).

3.  **Update Documentation:**
    -   Update JSDoc for `summarizeSessions` and `findSessionsToSummarize` to document the new parameter and behavior.

## Timeline

- 2025-11-22T18:37:20Z @tobiu assigned to @tobiu
- 2025-11-22T18:37:27Z @tobiu added the `enhancement` label
- 2025-11-22T18:37:27Z @tobiu added the `ai` label
- 2025-11-22T18:53:03Z @tobiu referenced in commit `bc4595e` - "Add capability to force summarize all sessions (ignoring 30-day limit) #7862"
- 2025-11-22T18:53:12Z @tobiu closed this issue
- 2025-11-23T11:34:25Z @tobiu cross-referenced by #7876

