---
id: 7546
title: Convert textEmbeddingService to TextEmbeddingService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-18T13:53:58Z'
updatedAt: '2025-10-18T14:02:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7546'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-18T14:02:13Z'
---
# Convert textEmbeddingService to TextEmbeddingService Neo.mjs Class

**Reported by:** @tobiu on 2025-10-18

---

**Parent Issue:** #7536 - Epic: Integrate Neo.mjs Core into MCP Servers

---

This ticket covers refactoring `ai/mcp/server/memory-core/services/textEmbeddingService.mjs` into a singleton class that extends `Neo.core.Base`. The file will also be renamed to `TextEmbeddingService.mjs` to follow a more consistent naming convention. This service handles creating embedding vectors for text.

## Acceptance Criteria

1.  A new file `ai/mcp/server/memory-core/services/TextEmbeddingService.mjs` is created with the refactored `TextEmbeddingService` class content.
2.  The `TextEmbeddingService` class extends `Neo.core.Base` and is configured as a singleton.
3.  Existing functions (`getEmbeddingModel`, `embedText`) are converted into class methods.
4.  The old file `ai/mcp/server/memory-core/services/textEmbeddingService.mjs` is deleted.
5.  The `ai/mcp/server/memory-core/services/toolService.mjs` is updated to import the `TextEmbeddingService` singleton and map its methods (if any are exposed as tools).
6.  Any other services that depend on `textEmbeddingService` are updated to use the new `TextEmbeddingService` singleton instance.
7.  All related functionalities continue to work correctly after the refactoring.

