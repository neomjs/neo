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
blockedBy: []
blocking: []
closedAt: '2025-10-18T14:02:13Z'
---
# Convert textEmbeddingService to TextEmbeddingService Neo.mjs Class

This ticket covers refactoring `ai/mcp/server/memory-core/services/textEmbeddingService.mjs` into a singleton class that extends `Neo.core.Base`. The file will also be renamed to `TextEmbeddingService.mjs` to follow a more consistent naming convention. This service handles creating embedding vectors for text.

## Acceptance Criteria

1.  A new file `ai/mcp/server/memory-core/services/TextEmbeddingService.mjs` is created with the refactored `TextEmbeddingService` class content.
2.  The `TextEmbeddingService` class extends `Neo.core.Base` and is configured as a singleton.
3.  Existing functions (`getEmbeddingModel`, `embedText`) are converted into class methods.
4.  The old file `ai/mcp/server/memory-core/services/textEmbeddingService.mjs` is deleted.
5.  The `ai/mcp/server/memory-core/services/toolService.mjs` is updated to import the `TextEmbeddingService` singleton and map its methods (if any are exposed as tools).
6.  Any other services that depend on `textEmbeddingService` are updated to use the new `TextEmbeddingService` singleton instance.
7.  All related functionalities continue to work correctly after the refactoring.

## Timeline

- 2025-10-18T13:53:58Z @tobiu assigned to @tobiu
- 2025-10-18T13:53:59Z @tobiu added the `enhancement` label
- 2025-10-18T13:53:59Z @tobiu added the `ai` label
- 2025-10-18T13:53:59Z @tobiu added parent issue #7536
- 2025-10-18T13:55:17Z @tobiu referenced in commit `c6e3ef0` - "#7546 renaming the file first to avoid git confusion"
- 2025-10-18T13:59:44Z @tobiu referenced in commit `36a7ac8` - "Convert textEmbeddingService to TextEmbeddingService Neo.mjs Class #7546"
- 2025-10-18T14:02:13Z @tobiu closed this issue

