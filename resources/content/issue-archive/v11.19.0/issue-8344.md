---
id: 8344
title: Fix Duplicate ID Error in VectorService
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-05T23:24:46Z'
updatedAt: '2026-01-05T23:32:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8344'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T23:32:38Z'
---
# Fix Duplicate ID Error in VectorService

The `VectorService` is encountering a "duplicate ID" error during batch upsert.
This occurs if the generated `ai-knowledge-base.jsonl` file contains duplicate entries (same content hash), causing the same ID to be pushed into `chunksToProcess` multiple times within the same batch.

**Fix:**
Update `VectorService.mjs` to ensure `chunksToProcess` only contains unique IDs by checking against a local `processedIds` Set during the filter loop.

## Timeline

- 2026-01-05T23:24:47Z @tobiu added the `bug` label
- 2026-01-05T23:24:47Z @tobiu added the `ai` label
- 2026-01-05T23:25:04Z @tobiu assigned to @tobiu
- 2026-01-05T23:31:45Z @tobiu referenced in commit `bd28172` - "Bugfix: Prevent Duplicate IDs in Vector Upsert #8344

Added a 'processedIds' Set to VectorService.embed() to track unique IDs locally during the chunk filtering process. This prevents duplicate chunks (identical content hash) from being added to the upsert batch, resolving the 'Expected IDs to be unique' error from ChromaDB."
### @tobiu - 2026-01-05T23:31:46Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fix to `VectorService.mjs` to prevent duplicate IDs from being added to the upsert batch.
> 
> **Fix Details:**
> - Introduced a `processedIds` Set in the `embed` method.
> - When iterating through `knowledgeBase` chunks, I now check if the `chunkId` (hash) has already been processed in the current run (`processedIds.has(chunkId)`).
> - This ensures that even if the source generation produced duplicate chunks (same content, same hash), only the first occurrence is sent to ChromaDB, satisfying the unique ID constraint.
> 
> This resolves the crash and ensures robust handling of potentially overlapping source scans.

- 2026-01-05T23:32:38Z @tobiu closed this issue

