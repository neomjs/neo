---
id: 8490
title: Harden and Refactor ChromaDB Defrag Tool
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - build
assignees:
  - tobiu
createdAt: '2026-01-10T00:47:29Z'
updatedAt: '2026-01-10T00:59:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8490'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T00:55:42Z'
---
# Harden and Refactor ChromaDB Defrag Tool

Improve the `buildScripts/defragChromaDB.mjs` tool to be more robust and enterprise-ready.

**Changes:**
1.  **Centralized Backups:** Move backups to `dist/chromadb-backups/<target>/` to avoid polluting the root directory.
2.  **Automated Cleanup:** Implement a retention policy to delete backups older than 7 days, keeping at least the last 3.
3.  **Error Handling:** Ensure the script exits with a non-zero code if *any* collection fails to restore, preventing false positives in CI/CD.
4.  **Config robustness:** Ensure config loading handles missing paths gracefully or enforces a standard.

**Goal:** Provide a reliable maintenance tool for the AI infrastructure.

## Timeline

- 2026-01-10T00:47:31Z @tobiu added the `enhancement` label
- 2026-01-10T00:47:31Z @tobiu added the `ai` label
- 2026-01-10T00:47:31Z @tobiu added the `refactoring` label
- 2026-01-10T00:47:31Z @tobiu added the `build` label
- 2026-01-10T00:50:57Z @tobiu assigned to @tobiu
- 2026-01-10T00:51:04Z @tobiu referenced in commit `d952600` - "feat: Harden ChromaDB defrag tool with backups and error tracking (#8490)"
### @tobiu - 2026-01-10T00:51:07Z

**Input from tobiu:**

> ◆ Implemented enterprise-grade improvements to the ChromaDB defragmentation tool:
> 
> 1.  **Centralized Backups:** Backups are now stored in `dist/chromadb-backups/<target>/` to prevent cluttering the root directory.
> 2.  **Retention Policy:** Added automated cleanup to keep only the last 3 backups and delete those older than 7 days.
> 3.  **Error Handling:** The script now tracks partial failures across collections and exits with a non-zero status code if any errors occur, ensuring better CI/CD integration.
> 4.  **Robustness:** Added validation for database paths and configuration loading.
> 
> Refactoring complete.

- 2026-01-10T00:54:51Z @tobiu referenced in commit `36f43ba` - "fix: Add missing Neo import to defrag script to support config loading (#8490)"
### @tobiu - 2026-01-10T00:54:53Z

**Input from tobiu:**

> ◆ Added a missing `import Neo from '../src/Neo.mjs';` to `buildScripts/defragChromaDB.mjs`.
> This was necessary because the configuration files (`ai/mcp/server/memory-core/config.mjs`) rely on the global `Neo` namespace and `Neo.setupClass`, which are not available in a standalone Node.js script unless explicitly imported.
> 
> Verified by successfully running `npm run ai:defrag-memory`.

- 2026-01-10T00:55:17Z @tobiu added the `agent-task:completed` label
### @tobiu - 2026-01-10T00:55:26Z

**Input from tobiu:**

> ◆ Task complete. The `defragChromaDB.mjs` script is now robust, backup-enabled, and verified working. Closing.

- 2026-01-10T00:55:42Z @tobiu closed this issue
- 2026-01-10T00:59:22Z @tobiu removed the `agent-task:completed` label

