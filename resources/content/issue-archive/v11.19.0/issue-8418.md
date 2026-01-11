---
id: 8418
title: Refactor and Document SearchService
state: CLOSED
labels:
  - documentation
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-08T11:20:12Z'
updatedAt: '2026-01-08T11:45:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8418'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T11:45:37Z'
---
# Refactor and Document SearchService

1.  **Refactor `SearchService.mjs`:**
    *   Remove unnecessary reactive configs `embeddingModel_` and `model_` (no hooks used).
    *   Update `ask()` method to use `QueryService.queryDocuments()` internally for better scoring and filtering.
    *   Update `ask()` signature to support `type` parameter (default 'all'), passing it to `QueryService`.
2.  **Add Documentation:**
    *   Add intent-driven JSDoc comments to `SearchService` class and methods.
    *   Explain *why* the service exists (RAG orchestration).
    *   Add `@see` links to relevant services.

## Timeline

- 2026-01-08T11:20:14Z @tobiu added the `documentation` label
- 2026-01-08T11:20:14Z @tobiu added the `ai` label
- 2026-01-08T11:20:14Z @tobiu added the `refactoring` label
- 2026-01-08T11:39:36Z @tobiu referenced in commit `697fac7` - "refactor: Enhance SearchService with QueryService logic and JSDoc (#8418)"
- 2026-01-08T11:44:55Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T11:45:23Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `SearchService.mjs` to use `QueryService` for document retrieval, ensuring consistent and intelligent scoring. Added intent-driven JSDoc documentation and updated `openapi.yaml` to support the `type` filter. Verified with `test_rag.mjs`.

- 2026-01-08T11:45:37Z @tobiu closed this issue

