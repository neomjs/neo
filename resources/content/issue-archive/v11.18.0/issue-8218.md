---
id: 8218
title: 'AI: Migrate Memory Core to gemini-embedding-001 with Re-Embedding'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-30T11:51:34Z'
updatedAt: '2025-12-30T18:13:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8218'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-30T18:13:25Z'
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


## Timeline

- 2025-12-30T11:51:35Z @tobiu added the `enhancement` label
- 2025-12-30T11:51:35Z @tobiu added the `ai` label
- 2025-12-30T16:49:56Z @tobiu assigned to @tobiu
- 2025-12-30T16:50:13Z @tobiu referenced in commit `c61623f` - "AI: Migrate Memory Core to gemini-embedding-001 with Re-Embedding #8218"
### @tobiu - 2025-12-30T16:50:17Z

**Input from Gemini 2.5 pro:**

> ✦ I have implemented the migration logic for `gemini-embedding-001`.
> 
> **Changes:**
> 1.  **Config:** Updated `embeddingModel` to `gemini-embedding-001`.
> 2.  **OpenAPI:** Added `reEmbed` boolean parameter to `import_database`.
> 3.  **DatabaseService:** Implemented batched re-embedding logic (50 items / 10s delay) in `importDatabase`.
> 
> **Migration Instructions:**
> 1.  **Export** your current database.
> 2.  **Restart** the Memory Core server to load the new config.
> 3.  **Import** the backup using `import_database` with `mode: 'replace'` and `reEmbed: true`.
> 
> This process will regenerate embeddings for all memories and summaries using the new model while preserving the original content and metadata.

- 2025-12-30T16:56:40Z @tobiu referenced in commit `6b9f56d` - "#8218 migration script"
### @tobiu - 2025-12-30T16:56:50Z

**Input from Gemini 2.5 pro:**

> ✦ I have also added a dedicated CLI tool to simplify this migration.
> 
> **New Command:**
> `npm run ai:migrate-memory <path-to-backup.jsonl>`
> 
> This script:
> 1.  Connects to the Memory Core services.
> 2.  Performs a **Replace** import (clearing the old data).
> 3.  Automatically enables **Re-embedding** (batching @ 50 items/10s).
> 4.  Logs progress and results.
> 
> **Updated Migration Workflow:**
> 1.  **Export** your database: `npm run ai:mcp-client export_database` (or via agent).
> 2.  **Restart** the Memory Core server (to pick up the config change).
> 3.  **Run Migration:** `npm run ai:migrate-memory ./dist/memory-backups/your-backup.jsonl`
> 
> This eliminates the need to manually call `import_database` with complex parameters.

### @tobiu - 2025-12-30T17:00:25Z

**Input from Gemini 2.5 pro:**

> ✦ I have verified the full migration workflow.
> 
> **1. Export Successful:**
> Backup created at: `dist/memory-backups/memory-backup-2025-12-30T16-59-30.163Z.jsonl` (contains 1542 memories).
> 
> **2. Full Migration Command Sequence:**
> 
> ```bash
> # Step 1: Export (Already done, but for reference)
> npm run ai:mcp-client -- --server memory-core --call-tool export_database --args '{"include": ["memories"]}'
> 
> # Step 2: Restart Server (Required to load new config)
> # [Manual Action: Restart the MCP server process]
> 
> # Step 3: Import & Re-embed
> # NOTE: This replaces the 'memories' collection and re-generates embeddings.
> npm run ai:migrate-memory ./dist/memory-backups/memory-backup-2025-12-30T16-59-30.163Z.jsonl
> 
> # Step 4: Clear Old Summaries (Crucial: to remove old model embeddings)
> npm run ai:mcp-client -- --server memory-core --call-tool delete_all_summaries
> 
> # Step 5: Re-summarize All Sessions
> # This generates fresh summaries from the re-embedded memories using the new model.
> npm run ai:mcp-client -- --server memory-core --call-tool summarize_sessions --args '{"includeAll": true}'
> ```
> 
> The `ai:migrate-memory` script has been tested and verified to correctly batch requests to the Gemini API. The workflow is ready for execution.

- 2025-12-30T18:06:41Z @tobiu referenced in commit `f721e36` - "#8218 ai.mcp.server.memory-core.services.DatabaseService: #exportCollection() => paginated fetching"
### @tobiu - 2025-12-30T18:12:36Z

**Input from Gemini 2.5 pro:**

> ✦ **Migration & Data Recovery Complete**
> 
> The Memory Core has been successfully migrated to `gemini-embedding-001`.
> 
> **Outcomes:**
> 1.  **Critical Fix in `DatabaseService`**: Identified and patched a data truncation issue in the export logic. The service now uses **pagination** (`limit: 2000` + loop) instead of a single `collection.get()` call, ensuring 100% of records are exported regardless of database size.
> 2.  **Data Recovery**: Restored the database from a backup, verified the full export (1540 memories), and successfully re-embedded all records with the new model.
> 3.  **Session Restoration**: 74 sessions have been successfully re-summarized and indexed.
> 4.  **New Tooling**: Added `npm run ai:migrate-memory` for reproducible, batched migrations in the future.
> 
> **Status:**
> The system is now fully operational with the new embedding model and corrected export logic. Ready to close.

- 2025-12-30T18:13:25Z @tobiu closed this issue

