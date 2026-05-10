---
id: 9712
title: Implement Hybrid Memory Core Architecture & Migration Subsystem
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-04T22:57:44Z'
updatedAt: '2026-04-04T23:18:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9712'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T23:17:32Z'
---
# Implement Hybrid Memory Core Architecture & Migration Subsystem

### Description
This ticket tracks the implementation of the Hybrid Memory Core Architecture, replacing the strict dependency on ChromaDB with a dual-engine adapter system favoring native SQLite.

1. **Feature: Hybrid Configuration (`engine`)**
   Introduce dual-DB support (`neo`, `chroma`, `both`) to `config.mjs` for seamless migration and offline-first context recall.
2. **Feature: Vector Database Proxies & Managers (`/managers/`)**
   Extract hardcoded logic into dedicated Manager singletons (`ChromaManager`, `SQLiteVectorManager`) and orchestrate them via a `StorageRouter` and `CollectionProxy` interface placed within `neo/ai/mcp/server/memory-core/managers/`.
3. **Refactor: Neo Standard Architectonics**
   Ensure all classes are properly siloed (one class per file) and properly initialized as `Neo.core.Base` components.
4. **Tool: Offline Migration Script**
   Create the script `buildScripts/ai/syncChromaToNeo.mjs` to execute fully local (Ollama-bound) dimensionality adjustments and transfers from Chroma.

## Timeline

- 2026-04-04T22:57:45Z @tobiu added the `enhancement` label
- 2026-04-04T22:57:45Z @tobiu added the `epic` label
- 2026-04-04T22:57:45Z @tobiu added the `ai` label
- 2026-04-04T22:57:45Z @tobiu added the `refactoring` label
- 2026-04-04T22:57:45Z @tobiu added the `architecture` label
- 2026-04-04T22:58:04Z @tobiu removed the `epic` label
- 2026-04-04T23:17:15Z @tobiu referenced in commit `8a10ddb` - "refactor: Memory Core Architecture Refactor (#9712)"
### @tobiu - 2026-04-04T23:17:29Z

**Input from Antigravity (gemini-3.1-pro):**

> ✦ The `memory-core` subsystem has been fully refactored and aligned with standard Neo.mjs principles:
> 
> 1. **Class Instantiation**: Migrated the `ChromaManager.mjs` and `SQLiteVectorManager.mjs` to singleton architectures inheriting from `Neo.core.Base`, utilizing the `.initAsync()`/`.ready()` standard lifecycle.
> 2. **Namespace Realignment**: Created the inner `managers/` namespace inside `/ai/mcp/server/memory-core/` and moved all database connectivity infrastructure into it safely.
> 3. **StorageRouter Isolation**: Split the dual-purposed Storage Router class string. The connection multiplexer is now abstracted inside `managers/CollectionProxy.mjs`. The primary `StorageRouter.mjs` has been converted into a generic singleton.
> 4. **Service Cleanups**: Decoupled `DreamService`, `HealthService`, `DatabaseLifecycleService`, `SummaryService` and others from directly integrating driver references, re-routing them to `StorageRouter` dynamically.
> 5. **Database Migration Script Context**: Migrated the SQLite vector migration script out of root over to `buildScripts/ai/syncMemoryChromaToNeo.mjs` to accurately define its scope.
> 
> All upstream API integrations have been updated to respect `StorageRouter.ready()` avoiding invocation duplication errors. Commits are now merged into `dev`.

- 2026-04-04T23:17:32Z @tobiu closed this issue
- 2026-04-04T23:17:42Z @tobiu assigned to @tobiu

