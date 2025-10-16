---
title: Implement Sync Database Service
labels: enhancement, AI
---

Parent epic: #7501
GH ticket id: #7508

**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

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
