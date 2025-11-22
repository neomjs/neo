---
id: 7865
title: Refactor Memory Core to use numeric timestamps for ChromaDB compatibility
state: OPEN
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-22T19:47:38Z'
updatedAt: '2025-11-22T19:47:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7865'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor Memory Core to use numeric timestamps for ChromaDB compatibility

ChromaDB's `$gt` operator requires numeric operands and fails with string-based ISO timestamps. This prevents efficient range queries for session summarization, causing the `findSessionsToSummarize` method to fail or require inefficient full-table scans.

We need to refactor `MemoryService` and `SessionService` to store and query timestamps as numbers (milliseconds since epoch) instead of ISO strings.

**Changes Required:**
1.  Update `MemoryService.addMemory` to store `timestamp` as `Date.now()`.
2.  Update `SessionService.summarizeSession` to store `timestamp` as `Date.now()`.
3.  Update `SessionService.findSessionsToSummarize` to query using numeric timestamps.

## Activity Log

- 2025-11-22 @tobiu added the `bug` label
- 2025-11-22 @tobiu added the `ai` label
- 2025-11-22 @tobiu assigned to @tobiu

