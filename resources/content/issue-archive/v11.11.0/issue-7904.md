---
id: 7904
title: Refactor Knowledge Base embedding logic into Vector Service
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-25T16:19:58Z'
updatedAt: '2025-11-25T17:29:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7904'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-25T17:29:44Z'
---
# Refactor Knowledge Base embedding logic into Vector Service

**Goal:** Further simplify `DatabaseService.mjs` by extracting the embedding generation and vector database upsert logic into a dedicated service.

**Current State:** 
`embedKnowledgeBase` is a complex method (~160 lines) that mixes:
1.  **Business Logic:** Calculating class inheritance chains, hashing chunks, and diffing against the existing database.
2.  **Integration Logic:** Interacting with the Google Generative AI API for embeddings and the ChromaDB client for storage.

**Proposed Architecture:**
- Create a new service (e.g., `services/VectorService.mjs` or `services/EmbeddingService.mjs`).
- Move the heavy lifting of the "ETL Load" phase to this service.

**Impact:** 
`DatabaseService` will become a pure lifecycle manager and orchestrator, delegating:
- **Extraction** to `source/*` providers.
- **Loading/Embedding** to the new `VectorService`.
This completes the separation of concerns for the Knowledge Base.

## Timeline

- 2025-11-25T16:19:59Z @tobiu added the `ai` label
- 2025-11-25T16:19:59Z @tobiu added the `refactoring` label
- 2025-11-25T17:28:51Z @tobiu assigned to @tobiu
- 2025-11-25T17:29:32Z @tobiu referenced in commit `227b7ae` - "Refactor Knowledge Base embedding logic into Vector Service #7904"
- 2025-11-25T17:29:44Z @tobiu closed this issue

