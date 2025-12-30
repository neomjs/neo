---
id: 8218
title: 'AI: Migrate Memory Core to gemini-embedding-001 with Re-Embedding'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-30T11:51:34Z'
updatedAt: '2025-12-30T11:51:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8218'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# AI: Migrate Memory Core to gemini-embedding-001 with Re-Embedding

**Objective:**
Migrate the Memory Core embedding model to `gemini-embedding-001` while preserving all existing memories and session summaries.

**Challenge:**
Directly importing old backups will fail because the stored embeddings are incompatible with the new model.

**Tasks:**
1.  **Update Config:** Modify `ai/mcp/server/memory-core/config.mjs` to set `embeddingModel: 'gemini-embedding-001'`.
2.  **Enhance Import Tool:** Update `DatabaseService.mjs` (or `importDatabase`) to support a `reEmbed: true` flag.
    *   When enabled, the import process must ignore the stored `embedding` field from the JSONL backup.
    *   It must generate a *new* embedding for the `document` content using the currently configured model.
    *   **Crucial:** This re-embedding process must be batched (e.g., 50 items at a time) to avoid hitting the Embedding API rate limits during migration.
3.  **Migration Workflow:**
    *   Export current database.
    *   Update config.
    *   Wipe database.
    *   Import with `reEmbed: true`.


## Activity Log

- 2025-12-30 @tobiu added the `enhancement` label
- 2025-12-30 @tobiu added the `ai` label

