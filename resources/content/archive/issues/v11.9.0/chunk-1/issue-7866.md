---
id: 7866
title: 'Bug: Prevent SessionService from summarizing the active session'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-22T20:54:59Z'
updatedAt: '2025-11-22T21:04:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7866'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-22T21:04:12Z'
---
# Bug: Prevent SessionService from summarizing the active session

The `summarizeSessions` method in `ai/mcp/server/memory-core/services/SessionService.mjs` can inadvertently summarize the currently active session.
This can happen in two scenarios:
1.  **Drift Detection:** The `findSessionsToSummarize` method detects the current session as having a mismatch between DB memories and the summary (since the summary doesn't exist or is outdated), flagging it for summarization.
2.  **Manual Trigger:** An agent manually calls the `summarize_sessions` tool with the current session ID or without arguments (triggering case 1).

Summarizing the active session is premature as the session is still ongoing. This leads to incomplete summaries and potentially multiple summary entries for the same session.

**Goal:**
Add a guard clause in `SessionService` to explicitly exclude `this.currentSessionId` from being summarized, both when finding sessions automatically and when a specific `sessionId` is requested.

**Task:**
-   Modify `SessionService.mjs` (around line 291 in `summarizeSessions`) to filter out `this.currentSessionId`.

## Timeline

- 2025-11-22T20:55:00Z @tobiu added the `bug` label
- 2025-11-22T20:55:00Z @tobiu added the `ai` label
- 2025-11-22T20:55:24Z @tobiu assigned to @tobiu
- 2025-11-22T21:04:06Z @tobiu referenced in commit `86ba7d5` - "Bug: Prevent SessionService from summarizing the active session #7866"
- 2025-11-22T21:04:12Z @tobiu closed this issue

