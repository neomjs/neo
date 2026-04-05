---
id: 9713
title: SQLite Memory Core Directory Decoupling & Maintenance
state: OPEN
labels:
  - ai
  - refactoring
assignees: []
createdAt: '2026-04-04T23:45:57Z'
updatedAt: '2026-04-04T23:45:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9713'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

