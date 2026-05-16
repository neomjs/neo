---
id: 9940
title: Enforce Explicit SQLite Indexing on Foreign Keys schema validation
state: OPEN
labels:
  - enhancement
  - architecture
  - performance
assignees:
  - tobiu
createdAt: '2026-04-12T18:58:54Z'
updatedAt: '2026-04-12T18:59:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9940'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Enforce Explicit SQLite Indexing on Foreign Keys schema validation

### Context
During the Sandman Vector Apoptosis stabilization marathon, we discovered a fatal architectural trap: SQLite `ON DELETE CASCADE` foreign key bindings do **NOT** automatically propagate column indexing upon the child nodes. This allowed unindexed `$O(N \times M)$` Cartesian `LEFT JOIN` paths to silently deadlock the Node.js V8 execution thread processing `better-sqlite3` operations on Native Edge Graphs over 50,000 vectors deep.

### Scope
While the `Edges(source)` and `Edges(target)` indexes were explicitly injected via #9938, we must harden the `SQLite.mjs` WAL Engine structure:
1. Implement a diagnostic schema assertion inside `initSchema()` that actively tests database index coverage mappings natively upon system start.
2. Extend `buildScripts/ai/defragSQLiteDB.mjs` to execute an index mapping validation routine right before executing its SQLite `VACUUM` loop to explicitly ensure that any dynamically deployed edge tables from external Swarm Skills natively inherit the required index paths.

### Origin Session
Origin Session ID: af26000d-914a-4eb0-8d28-2c09e9cb4cb5

## Timeline

- 2026-04-12T18:59:00Z @tobiu added the `enhancement` label
- 2026-04-12T18:59:00Z @tobiu added the `architecture` label
- 2026-04-12T18:59:00Z @tobiu added the `performance` label
- 2026-04-12T18:59:03Z @tobiu assigned to @tobiu

