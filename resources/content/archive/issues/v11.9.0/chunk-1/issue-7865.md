---
id: 7865
title: Refactor Memory Core to use numeric timestamps for ChromaDB compatibility
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-22T19:47:38Z'
updatedAt: '2025-11-22T20:05:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7865'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-22T20:05:57Z'
---
# Refactor Memory Core to use numeric timestamps for ChromaDB compatibility

ChromaDB's `$gt` operator requires numeric operands and fails with string-based ISO timestamps. This prevents efficient range queries for session summarization, causing the `findSessionsToSummarize` method to fail or require inefficient full-table scans.

We need to refactor `MemoryService` and `SessionService` to store and query timestamps as numbers (milliseconds since epoch) instead of ISO strings.

**Changes Required:**
1.  Update `MemoryService.addMemory` to store `timestamp` as `Date.now()`.
2.  Update `SessionService.summarizeSession` to store `timestamp` as `Date.now()`.
3.  Update `SessionService.findSessionsToSummarize` to query using numeric timestamps.

## Timeline

- 2025-11-22T19:47:39Z @tobiu added the `bug` label
- 2025-11-22T19:47:39Z @tobiu added the `ai` label
- 2025-11-22T19:47:52Z @tobiu assigned to @tobiu
- 2025-11-22T20:03:27Z @tobiu referenced in commit `ecda364` - "Refactor Memory Core to use numeric timestamps for ChromaDB compatibility #7865"
### @tobiu - 2025-11-22T20:04:36Z

**Input from Neo Agent OS:**

> ◆ Implemented the refactoring to use numeric timestamps (milliseconds since epoch) for both `MemoryService` (storage) and `SessionService` (querying/summarization).
> 
> ### Key Changes
> 1.  **Storage:** `MemoryService.addMemory` and `SessionService.summarizeSession` now store `timestamp` as a number (`Date.now()`).
> 2.  **Querying:** `SessionService.findSessionsToSummarize` now uses numeric comparisons for the 30-day window, resolving the ChromaDB `$gt` operator failure.
> 
> ### New Utility Scripts
> Added two new scripts to `ai/examples/` which should be highlighted in the release notes:
> 
> *   **`ai/examples/migrate_timestamps.mjs`**: A migration utility that scans all memories and summaries in ChromaDB and converts legacy ISO string timestamps to numbers. **Critical for upgrading existing databases.**
> *   **`ai/examples/debug_session_state.mjs`**: A "Thick Client" diagnostic tool that directly accesses the Memory Core services to detect session drift (mismatches between raw memories and summaries) and verify system health.
> 
> ### Verification
> Verified the fix using the debug script. The `SessionService` successfully self-healed on startup, detecting and summarizing previously un-queryable sessions.

### @tobiu - 2025-11-22T20:05:57Z

<img width="906" height="1377" alt="Image" src="https://github.com/user-attachments/assets/e6b839bb-aaf4-44ae-b28a-7839bf5c245c" />

<img width="892" height="1125" alt="Image" src="https://github.com/user-attachments/assets/ba9d7ad9-6bcc-4d5c-b1be-b0deccccfe4c" />

- 2025-11-22T20:05:58Z @tobiu closed this issue
- 2025-11-23T11:34:25Z @tobiu cross-referenced by #7876

