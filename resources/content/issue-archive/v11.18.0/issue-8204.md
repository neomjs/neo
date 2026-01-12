---
id: 8204
title: Fix Session Summary Timestamp Overwrite on Re-summarization
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-29T22:37:05Z'
updatedAt: '2025-12-29T22:39:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8204'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-29T22:39:10Z'
---
# Fix Session Summary Timestamp Overwrite on Re-summarization

The `SessionService.summarizeSession` method currently uses `Date.now()` for the `timestamp` metadata whenever a session is summarized or re-summarized. This causes old sessions to jump to the top of the "recent sessions" list (which sorts by timestamp) whenever they are re-processed (e.g., due to drift detection).

**Fix:**
Update `summarizeSession` to calculate the session's timestamp based on the **latest memory timestamp** within that session. This ensures that the summary reflects the actual time of the activity, not the time of the summarization process.

## Timeline

- 2025-12-29T22:37:05Z @tobiu added the `bug` label
- 2025-12-29T22:37:06Z @tobiu added the `ai` label
- 2025-12-29T22:38:35Z @tobiu assigned to @tobiu
- 2025-12-29T22:39:01Z @tobiu referenced in commit `0f1550f` - "Fix Session Summary Timestamp Overwrite on Re-summarization #8204"
- 2025-12-29T22:39:10Z @tobiu closed this issue

