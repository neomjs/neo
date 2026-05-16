---
id: 7215
title: Future Improvements for Local AI Knowledge Base
state: CLOSED
labels:
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2025-09-18T16:48:08Z'
updatedAt: '2025-09-20T09:36:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7215'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-20T09:36:15Z'
---
# Future Improvements for Local AI Knowledge Base

This document captures planned enhancements for the local AI knowledge base system to improve its efficiency, scalability, and developer experience.

## 1. Incremental Updates

**Problem:** The current system rebuilds the entire knowledge base from scratch every time `ai:build-kb` is run. This is inefficient and will become increasingly slow as the framework and its documentation grow. Changing a single JSDoc comment should not require a full, multi-minute re-embedding process.

**Proposed Solution:**
-   **Content Hashing:** When creating the knowledge base, store a hash (e.g., SHA-256) of the content of each chunk (class, method, guide, etc.) in the vector's metadata.
-   **Diffing Logic:** The `embedKnowledgeBase` script should be enhanced to perform a "diff" on startup:
    1.  Generate the knowledge chunks from the source files in memory.
    2.  Fetch all existing records from ChromaDB, or a subset based on source file paths.
    3.  Compare the hash of the newly generated chunks against the hashes stored in the database.
    4.  Identify three sets of chunks: **new**, **modified**, and **deleted**.
-   **Targeted DB Operations:**
    -   Use `collection.add()` for new chunks.
    -   Use `collection.update()` for modified chunks.
    -   Use `collection.delete()` for chunks whose source no longer exists.

**Benefits:**
-   Dramatically faster updates for day-to-day documentation changes.
-   Reduced API usage and cost, as only changed content is re-embedded.

## 2. Streaming for Memory Efficiency

**Problem:** The `createKnowledgeBase.mjs` script loads the entire `docs/output/all.json` into memory, and `embedKnowledgeBase.mjs` then loads the entire `dist/ai-knowledge-base.json`. For very large codebases or environments with limited memory, this could lead to performance issues or crashes.

**Proposed Solution:**
-   Implement a streaming pipeline between the creation and embedding scripts.
-   Use a streaming JSON parsing library (like `JSONStream` or `oboe.js`) in `embedKnowledgeBase.mjs`.
-   The `createKnowledgeBase.mjs` script could pipe its output directly to the embedding script, or the embedding script could read the JSON file chunk-by-chunk without loading the entire object into RAM.

**Benefits:**
-   Significantly lower memory footprint.
-   Improved scalability for much larger codebases.

## Timeline

- 2025-09-18T16:48:08Z @tobiu assigned to @tobiu
- 2025-09-18T16:48:09Z @tobiu added the `enhancement` label
- 2025-09-18T16:48:09Z @tobiu added the `no auto close` label
- 2025-09-19T14:06:47Z @tobiu referenced in commit `ceb1660` - "#7215 incremental updates"
- 2025-09-20T09:04:07Z @tobiu referenced in commit `bd204a2` - "#7215 Streaming for Memory Efficiency"
- 2025-09-20T09:36:15Z @tobiu closed this issue

