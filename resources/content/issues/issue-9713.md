---
id: 9713
title: SQLite Memory Core Directory Decoupling & Maintenance
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-04-04T23:45:57Z'
updatedAt: '2026-04-05T09:58:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9713'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-05T09:58:55Z'
---
# SQLite Memory Core Directory Decoupling & Maintenance

The SQLite database file `knowledge-graph.sqlite` currently resides inside the `chroma-neo-memory-core/` directory structure. This is factually incorrect and logically separates the hybrid engines poorly.

**Tasks:**
1. Update `config.mjs` path from `chroma-neo-memory-core/graph/knowledge-graph.sqlite` to a dedicated `neo-memory-core-sqlite/` directory.
2. Update `.gitignore` to ensure the new top-level database directory is not accidentally committed.
3. Create `buildScripts/ai/defragSQLiteDB.mjs` (executing a SQLite `VACUUM` command) to mirror the maintenance capabilities of `defragChromaDB.mjs`.

## Timeline

- 2026-04-04T23:45:59Z @tobiu added the `ai` label
- 2026-04-04T23:45:59Z @tobiu added the `refactoring` label
- 2026-04-05T09:58:41Z @tobiu referenced in commit `45d867d` - "refactor: Decouple SQLite Memory Core Directory & Maintenance (#9713)"
### @tobiu - 2026-04-05T09:58:46Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ I have completed the SQLite Database decoupling and implemented the `npm run ai:defrag-sqlite` maintenance script. 
> 
> All paths in `config.mjs`, `SQLiteVectorManager.mjs`, and `inspectGraph.mjs` have been updated to point to the new `neo-memory-core-sqlite/` directory.
> 
> The changes have been pushed to the `dev` branch.

- 2026-04-05T09:58:54Z @tobiu assigned to @tobiu
- 2026-04-05T09:58:56Z @tobiu closed this issue

