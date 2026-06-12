---
id: 9716
title: Disable SQLiteVectorManager boot when Engine is Chroma
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-05T08:33:04Z'
updatedAt: '2026-04-05T08:34:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9716'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-05T08:34:09Z'
---
# Disable SQLiteVectorManager boot when Engine is Chroma

When `memory-core/config.mjs` sets the vector database `engine` strictly to `'chroma'`, the hybrid `SQLiteVectorManager` was still executing its `initAsync` routine. This caused it to reach out to the local LLM (`TextEmbeddingService.embedText`) to validate table dimensions during server startup, unintentionally turning on the Ollama instance or crashing if unavailable.

We need to add a strict opt-out within `SQLiteVectorManager.initAsync` so it immediately returns if the engine is not `'neo'` or `'both'`.

## Timeline

- 2026-04-05T08:33:06Z @tobiu added the `bug` label
- 2026-04-05T08:33:06Z @tobiu added the `ai` label
- 2026-04-05T08:34:05Z @tobiu referenced in commit `8076d97` - "fix(memory-core): Opt out of SQLiteVectorManager initialization when engine is chroma (#9716)"
- 2026-04-05T08:34:06Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-05T08:34:08Z

Fixed: SQLiteVectorManager now returns early from `initAsync` if `aiConfig.engine` is configured as 'chroma', preventing unnecessary local LLM pings and avoiding zombie subprocesses.

- 2026-04-05T08:34:09Z @tobiu closed this issue

