---
id: 7839
title: 'Enhance AI SDK: Fix ChromaDB warnings and enable programmable backups'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-21T10:16:21Z'
updatedAt: '2025-11-21T10:18:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7839'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-21T10:18:15Z'
---
# Enhance AI SDK: Fix ChromaDB warnings and enable programmable backups

This issue consolidates several related changes aimed at improving the stability and usability of the AI infrastructure SDK.

**1. Fix ChromaDB Embedding Function Warning**
The ChromaDB client emits a persistent warning ("No embedding function configuration found") because our `dummyEmbeddingFunction` was too simple and flagged as "legacy".
*   **Change:** Update `dummyEmbeddingFunction` in `ai/mcp/server/*/config.mjs` to fully implement the `IEmbeddingFunction` interface (adding `name`, `getConfig`, `buildFromConfig`) with clear intent-driven comments explaining why.

**2. Enable Database Backup/Restore via SDK**
The `Memory_DatabaseService` was not exposed in the public SDK, preventing agents from programmatically triggering backups.
*   **Change:** Export `Memory_DatabaseService` in `ai/services.mjs`.
*   **Change:** Update `Memory_DatabaseService` to allow optional paths for export, defaulting to the config.
*   **Change:** Fix relative path issues in `ai/mcp/server/memory-core/config.mjs` by using `__dirname` to ensure backups work regardless of the execution context (npm run vs node).

**3. Refactor Import Logic**
*   **Change:** Update `importDatabase` in `Memory_DatabaseService` to cleanly handle collection clearing (replace mode) without using ternary operators, improving readability.

**4. Cleanup Example Scripts**
*   **Change:** Remove redundant `LifecycleService.ready()` calls in `ai/examples/self-healing.mjs` (since `ChromaManager.ready()` now handles it).
*   **New Artifacts:** Add `ai/examples/db-backup.mjs` and `ai/examples/db-restore.mjs` as working proofs of the new SDK capabilities.

## Timeline

- 2025-11-21T10:16:21Z @tobiu added the `enhancement` label
- 2025-11-21T10:16:22Z @tobiu added the `ai` label
- 2025-11-21T10:17:39Z @tobiu referenced in commit `33f1fe8` - "chore: Enhance AI SDK (Issue #7839)

- Fix ChromaDB 'No embedding function configuration' warning by implementing full IEmbeddingFunction interface in dummy functions.
- Enable programmable DB backup/restore by exporting Memory_DatabaseService in SDK.
- Fix relative path resolution for backups in memory-core config.
- Refactor importDatabase for cleaner replace logic.
- Add db-backup.mjs and db-restore.mjs examples.
- Cleanup redundant awaits in self-healing.mjs."
- 2025-11-21T10:17:57Z @tobiu assigned to @tobiu
- 2025-11-21T10:18:15Z @tobiu closed this issue
- 2025-11-21T10:19:01Z @tobiu cross-referenced by #7838

