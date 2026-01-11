---
id: 7811
title: 'Refactor: Move hardcoded Gemini model name to config in SessionService'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-19T14:39:01Z'
updatedAt: '2025-11-19T14:41:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7811'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T14:41:08Z'
---
# Refactor: Move hardcoded Gemini model name to config in SessionService

In `ai/mcp/server/memory-core/services/SessionService.mjs`, `embeddingModel_` is configured via `aiConfig.embeddingModel` (using `text-embedding-004`), but `model_` is hardcoded to `gemini-2.5-flash`.

We should move this hardcoded value into the configuration object (`ai/mcp/server/memory-core/config.mjs`) to allow for easier updates and consistency.

Tasks:
- Add `modelName` (or similar) to `defaultConfig` in `config.mjs`.
- Update `SessionService.mjs` to use the new config value.

## Timeline

- 2025-11-19T14:39:02Z @tobiu added the `enhancement` label
- 2025-11-19T14:39:02Z @tobiu added the `ai` label
- 2025-11-19T14:39:02Z @tobiu added the `refactoring` label
- 2025-11-19T14:39:55Z @tobiu assigned to @tobiu
- 2025-11-19T14:40:53Z @tobiu referenced in commit `46c8605` - "Refactor: Move hardcoded Gemini model name to config in SessionService #7811"
- 2025-11-19T14:41:08Z @tobiu closed this issue

