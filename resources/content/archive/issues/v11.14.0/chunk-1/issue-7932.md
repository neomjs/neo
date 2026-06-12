---
id: 7932
title: Fix timestamp format mismatch in Memory Core service
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T20:53:57Z'
updatedAt: '2025-11-29T20:56:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7932'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T20:54:41Z'
---
# Fix timestamp format mismatch in Memory Core service

The `MemoryService` was returning raw numeric timestamps from the ChromaDB database, but the OpenAPI schema expects ISO 8601 date-time strings. This caused validation errors in tools like `get_session_memories`.

**Changes:**
- Updated `listMemories` and `queryMemories` in `ai/mcp/server/memory-core/services/MemoryService.mjs` to convert numeric timestamps to ISO strings.

## Timeline

- 2025-11-29T20:53:57Z @tobiu added the `bug` label
- 2025-11-29T20:53:58Z @tobiu added the `ai` label
- 2025-11-29T20:54:14Z @tobiu assigned to @tobiu
- 2025-11-29T20:54:35Z @tobiu referenced in commit `62068e6` - "Fix timestamp format mismatch in Memory Core service #7932"
- 2025-11-29T20:54:41Z @tobiu closed this issue
### @tobiu - 2025-11-29T20:56:01Z

**Input from Gemini 2.5:**

> ✦ The fix has been applied in the previous turn. Closing this issue.


