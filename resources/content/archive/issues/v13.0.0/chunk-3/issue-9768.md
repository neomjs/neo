---
id: 9768
title: Refactor memory-core Database Lifecycle & Vector Managers
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-07T21:45:52Z'
updatedAt: '2026-04-07T23:03:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9768'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T23:03:08Z'
---
# Refactor memory-core Database Lifecycle & Vector Managers

This epic covers the architectural teardown and modularization of the `DatabaseLifecycleService` to support configuration-driven Vector Databases (Chroma vs SQLite) and local Inference Daemons (`openAiCompatible` via MLX).

### Architectural Context
The memory-core MCP server's initial infrastructure outgrew its design:
1. **The Vector Sprawl:** `DatabaseLifecycleService` organically grew into a "god class" that intertwines Chroma and local inference logic, making it impossible to run cleanly if an engine was disabled. 
2. **Missing Mac Provisioning:** The recent switch to `openAiCompatible` left Apple Silicon environments without an automated provisioning path for the MLX daemon (the Ollama equivalent).
3. **The Proxy Coupling:** `CollectionProxy` was statically importing mutually exclusive managers (`ChromaManager` and `SQLiteVectorManager`), breaking the dependency inversion principles established by `aiConfig.engine`.

### Implementation Plan
A finalized implementation plan has been written to address this:
1. **MLX Provisioning:** Create a `setup_mlx.sh` script to explicitly pull `gemma4:31b` and `qwen3-embedding` via python `mlx_lm` and run the daemon on port `11435` to avoid collisions.
2. **Vector Clean Architecture:** Implement an `AbstractVectorManager` and use a dynamic factory inside `CollectionProxy` to load managers.
3. **Service Refactoring:** Dismantle `DatabaseLifecycleService` into `ChromaLifecycleService` and `InferenceLifecycleService`, properly exporting them via `ai/services.mjs` using the singleton `.ready()` paradigm.

_Note: This issue was created to transfer context to a fresh AI session._

## Timeline

- 2026-04-07T21:45:56Z @tobiu added the `ai` label
- 2026-04-07T21:45:56Z @tobiu added the `refactoring` label
- 2026-04-07T21:45:56Z @tobiu added the `architecture` label
- 2026-04-07T21:47:10Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-07T22:07:44Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ The Memory Core architecture has been refactored in this session.
> 
> 1.  **Vector Managers:** The `CollectionProxy` now dynamically imports vector managers (Chroma or SQLite) based on `aiConfig.engine`. Both `ChromaManager` and `SQLiteVectorManager` now correctly inherit from a shared `AbstractVectorManager`.
> 2.  **Lifecycle Modularization:** The monolithic `DatabaseLifecycleService` was dismantled.
> 3.  **Explicit Daemons:** We introduced `ChromaLifecycleService` dedicated purely to ChromaDB orchestration, and `InferenceLifecycleService` for local inference daemons (Ollama / MLX).
> 4.  **Verification:** The `memory-core` MCP server was manually verified to boot correctly, waiting asynchronously for both the Inference and Chroma services before resolving transport.
> 
> This concludes the architectural teardown. The system is structurally robust against config deviations.

- 2026-04-07T22:10:42Z @tobiu referenced in commit `c8da337` - "refactor(ai): modularize memory-core vector managers & lifecycles (#9768)

- Created AbstractVectorManager for Chroma & SQLite engines.
- Refactored CollectionProxy to dynamically import vector engines based on config.
- Deprecated monolithic DatabaseLifecycleService in favor of explicit ChromaLifecycleService and InferenceLifecycleService."
- 2026-04-07T22:14:11Z @tobiu referenced in commit `403d9e7` - "fix(ai): resolve ollama auto-boot enoent on apple silicon (#9768)

- Explicitly map homebrew bin path for headless inference spawn"
- 2026-04-07T22:15:34Z @tobiu referenced in commit `4d7386b` - "fix(ai): enhance offline ollama probe to support windows (#9768)

- Added fallback for Windows LOCALAPPDATA path explicitly for background telemetry."
- 2026-04-07T22:19:17Z @tobiu referenced in commit `33b3b88` - "docs(ai): apply Knowledge Base Enhancement Strategy to new abstraction layers (#9768)

- Created structural 'Anchor' semantic definitions for InferenceLifecycleService, ChromaLifecycleService, and AbstractVectorManager.
- Included intent-driven keywords and 'Echo' property bindings to support the Agent OS GraphRAG retrieval protocol."
- 2026-04-07T23:03:08Z @tobiu closed this issue

