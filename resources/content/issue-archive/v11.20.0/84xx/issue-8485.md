---
id: 8485
title: Implement and Integrate Knowledge Base Defragmentation Script
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-09T23:12:55Z'
updatedAt: '2026-01-09T23:17:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8485'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T23:17:23Z'
---
# Implement and Integrate Knowledge Base Defragmentation Script

The knowledge base vector index (ChromaDB) suffers from severe fragmentation (bloat) when large numbers of documents are updated or deleted, as HNSW indices do not immediately reclaim disk space. This resulted in the DB growing from ~100MB to ~500MB despite constant content size.

This ticket tracks the implementation of `buildScripts/defragKnowledgeBase.mjs` to:
1.  Connect to the local ChromaDB.
2.  Buffer all data into memory.
3.  Recreate the collection (wiping the old index).
4.  Restore the data.
5.  Physically delete orphaned index directories.
6.  Log the final database size.

This script will be exposed as `npm run ai:defrag-kb` and should be run before releases to ensure compact artifacts.

## Timeline

- 2026-01-09T23:12:56Z @tobiu added the `enhancement` label
- 2026-01-09T23:12:56Z @tobiu added the `ai` label
- 2026-01-09T23:12:56Z @tobiu added the `build` label
- 2026-01-09T23:16:32Z @tobiu referenced in commit `c1b86a2` - "feat: Add Knowledge Base Defragmentation Script (#8485)"
- 2026-01-09T23:16:41Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T23:17:02Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the knowledge base defragmentation script (`buildScripts/defragKnowledgeBase.mjs`) and added the `ai:defrag-kb` script to `package.json`.
> 
> **Implementation Details:**
> - **In-Memory Buffer:** The script loads all vector data into memory before resetting the database, avoiding complex temp files for now (safe for datasets < 1GB).
> - **Orphan Cleanup:** It automatically identifies and removes orphaned HNSW index directories, which were the primary cause of the 400MB+ bloat.
> - **Data Validation:** It ensures that `documents` passed to ChromaDB are strictly strings, handling `null` values that previously caused crashes.
> - **Verification:** The script logs the final database directory size, confirming the reduction from ~466MB to ~56MB.
> 
> The script is now available for use in the release pipeline.

- 2026-01-09T23:17:23Z @tobiu closed this issue

