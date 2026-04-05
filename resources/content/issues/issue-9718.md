---
id: 9718
title: Stabilize Hybrid Vector Database Embedding Generation
state: CLOSED
labels:
  - bug
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-05T09:12:40Z'
updatedAt: '2026-04-05T09:24:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9718'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-05T09:24:22Z'
---
# Stabilize Hybrid Vector Database Embedding Generation

The hybrid vector database architecture (both mode) currently experiences cross-process dependency conflicts and "fetch failed" errors. This is due to global configuration conflicts when the `TextEmbeddingService` is manually called by high-level services like `DatabaseService` and `SessionService`. 

To resolve this, we need to completely decouple embedding generation from high-level MCP services, pushing it down natively into the storage engine managers (`ChromaManager` and `SQLiteVectorManager`).

**Tasks:**
1. Refactor `TextEmbeddingService` to accept `explicitProvider` overrides dynamically.
2. Delegate runtime embedding regeneration within `SQLiteVectorManager`'s `upsert` and `query` methods explicitly using `neoEmbeddingProvider`.
3. Eliminate overarching embedding calls from `DatabaseService` and `SessionService`.
4. Ensure `HealthService` acknowledges `ollama` as a valid provider to prevent false 'degraded' states.
5. Provide localized Playwright testing (`StorageBothMode.spec.mjs`) to verify independent provider delegation.

## Timeline

- 2026-04-05T09:12:42Z @tobiu added the `bug` label
- 2026-04-05T09:12:42Z @tobiu added the `ai` label
- 2026-04-05T09:12:42Z @tobiu added the `architecture` label
### @tobiu - 2026-04-05T09:22:10Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Finished decoupling memory engine components and stabilized test. Health API key check is now engine-driven. Unused imports removed.

- 2026-04-05T09:24:18Z @tobiu referenced in commit `8e5f6ac` - "fix: Stabilize Hybrid Vector Database Embedding Generation (#9718)"
- 2026-04-05T09:24:20Z @tobiu assigned to @tobiu
- 2026-04-05T09:24:22Z @tobiu closed this issue

