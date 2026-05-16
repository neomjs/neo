---
id: 7999
title: Fix ReferenceError in Memory Core SessionService when GEMINI_API_KEY is missing
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T19:49:25Z'
updatedAt: '2025-12-02T19:56:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7999'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T19:56:46Z'
---
# Fix ReferenceError in Memory Core SessionService when GEMINI_API_KEY is missing

Starting the memory core server without a `GEMINI_API_KEY` causes a `ReferenceError: Cannot access 'HealthService' before initialization`.

This is caused by a circular dependency between `SessionService.mjs` and `HealthService.mjs`.
`HealthService` imports `SessionService`, and `SessionService` imports `HealthService`.
When `SessionService` is initialized (triggered by `HealthService` import), it attempts to call `HealthService.recordStartupSummarization` in its `construct` method if the API key is missing. Since `HealthService` is still initializing, this throws.

**Proposed Fix:**
Remove the static import of `SessionService` in `HealthService.mjs` and access `SessionService` lazily inside `#performHealthCheck`.

## Timeline

- 2025-12-02T19:49:26Z @tobiu added the `bug` label
- 2025-12-02T19:49:26Z @tobiu added the `ai` label
- 2025-12-02T19:50:55Z @tobiu assigned to @tobiu
- 2025-12-02T19:56:32Z @tobiu referenced in commit `9839409` - "Fix ReferenceError in Memory Core SessionService when GEMINI_API_KEY is missing #7999"
- 2025-12-02T19:56:46Z @tobiu closed this issue

