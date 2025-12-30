---
id: 8219
title: 'AI: Implement Batched Session Summarization'
state: OPEN
labels:
  - enhancement
  - ai
  - performance
assignees: []
createdAt: '2025-12-30T11:51:44Z'
updatedAt: '2025-12-30T11:51:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8219'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# AI: Implement Batched Session Summarization

**Objective:**
Prevent rate-limit errors when summarizing large numbers of sessions (e.g., during startup or migration).

**Current State:**
`SessionService.summarizeSessions()` uses `Promise.all()` to trigger summarization for *all* candidates simultaneously. With ~160+ sessions, this triggers ~160 concurrent LLM and Embedding API calls, causing immediate failure.

**Tasks:**
1.  **Refactor `SessionService.mjs`:** Update `summarizeSessions` to process sessions in chunks (e.g., batch size of 5 or 10).
2.  **Logic:**
    *   Split `sessionsToSummarize` into chunks.
    *   Process chunks sequentially (awaiting each chunk).
    *   Process items within a chunk in parallel.
3.  **Config:** Optionally add `summarizationConcurrency` to `aiConfig`.

**Benefit:**
Ensures robust operation for users with long history and enables safe re-summarization of legacy data if needed.


## Activity Log

- 2025-12-30 @tobiu added the `enhancement` label
- 2025-12-30 @tobiu added the `ai` label
- 2025-12-30 @tobiu added the `performance` label

