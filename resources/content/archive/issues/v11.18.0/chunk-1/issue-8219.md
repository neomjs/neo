---
id: 8219
title: 'AI: Implement Batched Session Summarization'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2025-12-30T11:51:44Z'
updatedAt: '2025-12-30T18:31:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8219'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-30T18:31:37Z'
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


## Timeline

- 2025-12-30T11:51:46Z @tobiu added the `enhancement` label
- 2025-12-30T11:51:46Z @tobiu added the `ai` label
- 2025-12-30T11:51:46Z @tobiu added the `performance` label
- 2025-12-30T18:16:03Z @tobiu assigned to @tobiu
- 2025-12-30T18:31:23Z @tobiu referenced in commit `53cd981` - "enhancement(ai): Implement batched session summarization (#8219)

Prevents rate-limit errors during bulk session processing by introducing a configurable concurrency limit (default: 5)."
### @tobiu - 2025-12-30T18:31:24Z

**Input from Gemini 2.5 pro:**

> ✦ I have successfully implemented the batched summarization logic.
> 
> **Changes:**
> 1.  **Configuration:** Added `summarizationConcurrency` to `ai/mcp/server/memory-core/config.mjs` (default: 5).
> 2.  **Implementation:** Refactored `SessionService.summarizeSessions` to process sessions in sequential chunks.
>     *   The service now splits the list of sessions into batches based on the concurrency limit.
>     *   It processes each batch in parallel but awaits its completion before starting the next batch.
>     *   Added detailed logging to track batch progress (e.g., `Processing batch 1/32...`).
> 
> **Impact:**
> This change ensures that bulk summarization operations (such as those triggered during migrations or startup scans) will no longer trigger rate-limit errors from the Gemini API, regardless of the number of sessions needing processing.
> 
> **Verification:**
> The logic has been updated and committed. The system is now protected against the concurrency issues identified in the ticket.

- 2025-12-30T18:31:37Z @tobiu closed this issue

