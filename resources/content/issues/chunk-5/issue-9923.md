---
id: 9923
title: '[Sub-Task] Configuration & Lifecycle Re-alignment for Two-Pillar RAG'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-12T14:15:44Z'
updatedAt: '2026-04-12T16:59:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9923'
author: tobiu
commentsCount: 0
parentIssue: 9922
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-12T15:36:27Z'
---
# [Sub-Task] Configuration & Lifecycle Re-alignment for Two-Pillar RAG

Origin Session ID: af26000d-914a-4eb0-8d28-2c09e9cb4cb5
Parent Epic: #9922

## Context
As part of the Two-Pillar Hybrid RAG migration (replacing `sqlite-vec` with ChromaDB for dense vectors), the memory-core MCP server's configuration and startup sequences must be fundamentally rewired. 

## Technical Requirements
1. **Configuration (`config.mjs` / `config.template.mjs`):** Extract hardcoded `sqlite-vec` engine biases. Define explicit parameters for `chromaHost`, `chromaPort`, and native Graph tracking. The `engine` config must formally support a bifurcated `hybrid` paradigm as default.
2. **System Lifecycle (`SystemLifecycleService.mjs`):** Adjust the OS boot orchestrator to initialize both the SQLite Native Graph and the ChromaDB external dependency in strict sequential ordering. Ensure graceful degradation or crash-loops if Chroma is missing.
3. **Inference & Chroma Lifecycles (`InferenceLifecycleService.mjs`, `ChromaLifecycleService.mjs`):** Deprecate legacy flat-table logic. Re-establish robust `.ping()` logic to `ChromaLifecycleService` ensuring the Docker container or local server is responsive before launching memory operations.

## Definitions of Done
- All touched files conform strictly to the 'Anchor & Echo' JSDoc protocol.
- Server boots and correctly authenticates both DB engines.

## Timeline

- 2026-04-12T14:15:45Z @tobiu added the `enhancement` label
- 2026-04-12T14:15:45Z @tobiu added the `ai` label
- 2026-04-12T14:15:45Z @tobiu added the `architecture` label
- 2026-04-12T14:15:56Z @tobiu added parent issue #9922
- 2026-04-12T14:23:23Z @tobiu referenced in commit `1d4fbd7` - "feat(memory-core): Re-align configuration and lifecycles for Two-Pillar RAG (#9923)"
- 2026-04-12T14:23:34Z @tobiu cross-referenced by PR #9926
- 2026-04-12T15:36:26Z @tobiu referenced in commit `66569e6` - "feat: Two-Pillar Hybrid RAG Architecture (#9922) (#9926)

* feat(memory-core): Re-align configuration and lifecycles for Two-Pillar RAG (#9923)

* feat(memory-core): Migrate Database service and Health Diagnostics (#9924)

* feat(memory-core): Implement Dual-Pass Re-Ranking Middleware and Extricate SQLiteVectorManager (#9925)"
- 2026-04-12T15:36:27Z @tobiu closed this issue
- 2026-04-12T16:59:32Z @tobiu assigned to @tobiu

