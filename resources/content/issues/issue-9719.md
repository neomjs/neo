---
id: 9719
title: 'Hybrid Vector DB: Decouple TextEmbeddingService and Eliminate Provider Fallbacks'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-05T09:41:49Z'
updatedAt: '2026-04-05T09:43:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9719'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-05T09:42:58Z'
---
# Hybrid Vector DB: Decouple TextEmbeddingService and Eliminate Provider Fallbacks

### Problem
The `TextEmbeddingService` relied on a global fallback `aiConfig.embeddingProvider` alongside engine-specific configs (`chromaEmbeddingProvider` and `neoEmbeddingProvider`). This created ambiguity, caused potential API key requirement issues (`GEMINI_API_KEY` being required even if local embeddings are preferred), and prevented a clean `both` engine mode setup from operating correctly since both storage managers shared the same fallback context.

### Solution
- Removed the global `embeddingProvider` from `config.mjs` to eliminate fallback ambiguity.
- Refactored `TextEmbeddingService` to require explicit provider declaration via `embedText(text, explicitProvider)`.
- Updated `ChromaManager` and `SQLiteVectorManager` to strictly supply their respective embedding engine requirements to the `TextEmbeddingService`.
- Corrected `HealthService` API key checks to properly identify `chroma` vs `neo` engine requirements without assuming `gemini` based on a global fallback.

## Timeline

- 2026-04-05T09:41:51Z @tobiu added the `enhancement` label
- 2026-04-05T09:41:51Z @tobiu added the `ai` label
- 2026-04-05T09:42:39Z @tobiu referenced in commit `6b95c8f` - "refactor(ai): Hybrid Vector DB: Decouple TextEmbeddingService and Eliminate Provider Fallbacks (#9719)"
- 2026-04-05T09:42:55Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-05T09:42:57Z

Fix committed locally and pushed to the repository. The implementation removes the global  fallback and enforces rigorous provider configurations in , ensuring deterministic routing in  engine setups.

- 2026-04-05T09:42:59Z @tobiu closed this issue
### @tobiu - 2026-04-05T09:43:06Z

Fix committed locally and pushed to the repository. The implementation removes the global `embeddingProvider` fallback and enforces rigorous provider configurations in `TextEmbeddingService`, ensuring deterministic routing in `both` engine setups.


