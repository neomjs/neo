---
id: 7508
title: Implement Sync Database Service
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-16T10:56:58Z'
updatedAt: '2025-10-16T11:01:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7508'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-16T11:01:22Z'
---
# Implement Sync Database Service

**Reported by:** @tobiu on 2025-10-16

---

**Parent Issue:** #7501 - Architect AI Knowledge Base as MCP Server

---

This ticket covers the implementation of the `sync_database` service. This is the primary write operation for the server, responsible for building the knowledge base from source files and embedding the content into the ChromaDB collection.

The implementation will adapt and combine the logic from two scripts:
1.  `buildScripts/ai/createKnowledgeBase.mjs` (Parsing source files)
2.  `buildScripts/ai/embedKnowledgeBase.mjs` (Scoring, embedding, and upserting to DB)

Since this is a long-running, asynchronous process, the service should be designed to run in the background without blocking the server.

## Acceptance Criteria

1.  The `databaseService.mjs` file is updated with a `syncDatabase` function.
2.  The function orchestrates the full build and embed process:
    - It parses all knowledge sources (JSDoc, guides, etc.) into an in-memory array of chunks.
    - It enriches the chunks (e.g., with inheritance chains).
    - It performs a diff against the existing documents in ChromaDB to identify chunks to add, update, or delete.
    - It generates embeddings for new/updated chunks and upserts them into the database.
    - It deletes stale chunks from the database.
3.  The function is asynchronous and does not block the main thread.
4.  The `toolService.mjs` `serviceMapping` is updated to point the `sync_database` operationId to the new service function.

