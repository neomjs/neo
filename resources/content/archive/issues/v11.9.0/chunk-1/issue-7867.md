---
id: 7867
title: Refactor MemoryService to use crypto-based IDs
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-22T21:05:52Z'
updatedAt: '2025-11-22T21:09:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7867'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-22T21:09:10Z'
---
# Refactor MemoryService to use crypto-based IDs

The `MemoryService.mjs` currently generates memory IDs using a timestamp-based format (`mem_${timestamp}`). This is inconsistent with `SessionService.mjs`, which uses `crypto.randomUUID()` for session IDs. Furthermore, relying on timestamps for IDs is generally discouraged when better alternatives like UUIDs are available, especially since the timestamp is already stored as metadata.

**Goal:**
Refactor `MemoryService.mjs` to generate memory IDs using `crypto.randomUUID()`, ensuring consistency across the memory core services.

**Tasks:**
1.  Import `crypto` in `ai/mcp/server/memory-core/services/MemoryService.mjs`.
2.  Update the `addMemory` method to generate `memoryId` using `crypto.randomUUID()` instead of the timestamp-based string.

## Timeline

- 2025-11-22T21:05:54Z @tobiu added the `ai` label
- 2025-11-22T21:05:54Z @tobiu added the `refactoring` label
- 2025-11-22T21:06:02Z @tobiu assigned to @tobiu
- 2025-11-22T21:09:06Z @tobiu referenced in commit `5a04c76` - "Refactor MemoryService to use crypto-based IDs #7867"
- 2025-11-22T21:09:10Z @tobiu closed this issue

