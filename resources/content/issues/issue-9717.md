---
id: 9717
title: Hybrid DB Refactoring & Vector Decoupling
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-05T09:02:47Z'
updatedAt: '2026-04-05T09:04:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9717'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-05T09:04:23Z'
---
# Hybrid DB Refactoring & Vector Decoupling

This ticket consolidates infrastructural refactoring for the memory-core and knowledge-base MCP servers aimed at stabilizing process concurrency and decoupling LLM embedding providers from storage engines.

**Resolutions:**
- Introduced a sequential `#chromaLock` Mutex Promise Queue inside `ChromaManager.mjs` to serialize ChromaDB setup, safely encapsulating `console.warn` suppression to halt global state race conditions.
- Validated the Mutex natively inside an in-RAM `Playwright` unit test decoupled from local Ollama instances.
- Refactored `HealthService.mjs` to dynamically probe specific instances defined by `aiConfig.engine` via `StorageRouter`, fixing structural blockages throwing false positives during local `engine: chroma` operations. 
- Overhauled `TextEmbeddingService` usage globally across MCP services, delegating raw array Vector generation fully down to the local `Collection` abstraction nodes so `SQLiteVectorManager` correctly outputs `ollama` 4096d arrays while `ChromaManager` flawlessly retains `gemini` 768d generation simultaneously with `engine: both`.

## Timeline

- 2026-04-05T09:02:48Z @tobiu added the `enhancement` label
- 2026-04-05T09:02:48Z @tobiu added the `ai` label
- 2026-04-05T09:03:32Z @tobiu referenced in commit `4a90bd4` - "refactor: Sequence ChromaDB Mutex and decouple HealthService sqlite routing (#9717)"
- 2026-04-05T09:04:22Z @tobiu assigned to @tobiu
- 2026-04-05T09:04:23Z @tobiu closed this issue

