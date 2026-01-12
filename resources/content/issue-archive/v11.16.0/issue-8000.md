---
id: 8000
title: Allow Memory Core to start without GEMINI_API_KEY (TextEmbeddingService)
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T19:57:07Z'
updatedAt: '2025-12-02T20:38:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8000'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T20:38:54Z'
---
# Allow Memory Core to start without GEMINI_API_KEY (TextEmbeddingService)

`TextEmbeddingService` currently throws an error in its `construct` method if `GEMINI_API_KEY` is missing. This prevents the Memory Core server from starting in a degraded state, which is the intended behavior when the key is not configured (e.g. for database lifecycle management only).

**Error:**
```
Error: The GEMINI_API_KEY environment variable must be set to use semantic search endpoints.
    at TextEmbeddingService.construct ...
```

**Goal:**
- Modify `TextEmbeddingService` to log a warning instead of throwing during construction.
- Ensure methods like `embed` throw a helpful error *when called* if the key is missing, rather than preventing startup.

## Timeline

- 2025-12-02T19:57:09Z @tobiu added the `bug` label
- 2025-12-02T19:57:09Z @tobiu added the `ai` label
- 2025-12-02T19:57:19Z @tobiu assigned to @tobiu
- 2025-12-02T20:38:47Z @tobiu referenced in commit `78aa586` - "Allow Memory Core to start without GEMINI_API_KEY (TextEmbeddingService) #8000"
- 2025-12-02T20:38:54Z @tobiu closed this issue

