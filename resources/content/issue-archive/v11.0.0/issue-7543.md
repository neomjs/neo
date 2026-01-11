---
id: 7543
title: Convert memoryService to MemoryService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-18T13:06:33Z'
updatedAt: '2025-10-18T13:19:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7543'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-18T13:19:49Z'
---
# Convert memoryService to MemoryService Neo.mjs Class

This ticket covers refactoring `ai/mcp/server/memory-core/services/memoryService.mjs` into a singleton class that extends `Neo.core.Base`. The file will also be renamed to `MemoryService.mjs` to follow a more consistent naming convention. This service handles adding, listing, and querying agent memories.

## Acceptance Criteria

1.  The file `ai/mcp/server/memory-core/services/memoryService.mjs` is renamed to `ai/mcp/server/memory-core/services/MemoryService.mjs`.
2.  The `memoryService.mjs` module is refactored into a `MemoryService` class.
3.  The `MemoryService` class extends `Neo.core.Base` and is configured as a singleton.
4.  Existing functions (`addMemory`, `listMemories`, `queryMemories`) are converted into class methods.
5.  The `ai/mcp/server/memory-core/services/toolService.mjs` is updated to import the `MemoryService` singleton and map its methods.
6.  Any other services that depend on `memoryService` are updated to use the new `MemoryService` singleton instance.
7.  All related tools (e.g., `add_memory`, `get_session_memories`, `query_raw_memories`) continue to function correctly after the refactoring.

## Timeline

- 2025-10-18T13:06:33Z @tobiu assigned to @tobiu
- 2025-10-18T13:06:34Z @tobiu added the `enhancement` label
- 2025-10-18T13:06:34Z @tobiu added parent issue #7536
- 2025-10-18T13:06:35Z @tobiu added the `ai` label
- 2025-10-18T13:19:42Z @tobiu referenced in commit `bfbe2db` - "Convert memoryService to MemoryService Neo.mjs Class #7543"
- 2025-10-18T13:19:49Z @tobiu closed this issue

