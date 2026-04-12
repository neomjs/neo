---
id: 9937
title: Optimize Vector Apoptosis Cartesian Deadlock & Suppress Chroma SDK Warnings
state: CLOSED
labels:
  - bug
  - ai
  - architecture
  - performance
assignees:
  - tobiu
createdAt: '2026-04-12T18:46:08Z'
updatedAt: '2026-04-12T18:49:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9937'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-12T18:49:35Z'
---
# Optimize Vector Apoptosis Cartesian Deadlock & Suppress Chroma SDK Warnings

### The Problem

Sandman (`DreamService`) encountered a critical freeze event during the `Vector Apoptosis` routine (`GraphService.getOrphanedNodes()`). The Node.js event pool locked up, completely hanging the backend permanently without any console output or crashing. 

**Root Cause 1: SQLite Unindexed Left Join Deadlock**
The initial SQL implementation relied on a dual-condition `LEFT JOIN`:
```sql
SELECT n.id, n.data 
FROM Nodes n 
LEFT JOIN Edges e ON n.id = e.source OR n.id = e.target 
WHERE e.id IS NULL
```
SQLite foreign key constraints do not implicitly create child column indices. Compounded by an `OR` condition in the `JOIN ON` clause (which negates SQLite's query plan optimization), this query executed an unindexed Cartesian product $O(N \times M)$ scan. At the current Native Edge Graph scale, this generated ~25,000,000 string comparisons synchronously on the `better-sqlite3` V8 thread, entirely deadlocking the MCP engine. 

**Root Cause 2: Chroma SDK Deserialization Noise**
The `mcp-server-memory-core` stderr output was severely polluted with `dynamic_text_embedding_service` package resolution warnings resulting from Python `ChromaDB` schema deserialization mismatches.

### The Solution

1. **Topological N-Query Optimization (`SQLite.mjs` / `GraphService.mjs`):**
    - Rewrote the Vector Apoptosis extraction logic utilizing twin uncorrelated `NOT EXISTS` subqueries to explicitly decouple the execution block and circumvent the Cartesian sweep.
    - Surgically injected `CREATE INDEX IF NOT EXISTS` natively into the WAL Initialization sequence (`SQLite.mjs`) targeting `Edges(source)` and `Edges(target)`. 
2. **MCP Terminal Suppression (`ChromaManager.mjs`):**
    - Corrected the `console.warn` suppression filter string interpolation to strictly mirror Chromium backend logging specifications (using underscoring: `dummy_embedding_function`).

### Origin Session
Origin Session ID: af26000d-914a-4eb0-8d28-2c09e9cb4cb5

## Timeline

- 2026-04-12T18:46:10Z @tobiu added the `bug` label
- 2026-04-12T18:46:10Z @tobiu added the `ai` label
- 2026-04-12T18:46:10Z @tobiu added the `architecture` label
- 2026-04-12T18:46:10Z @tobiu added the `performance` label
- 2026-04-12T18:46:19Z @tobiu referenced in commit `612acaf` - "fix(memory-core): Optimize Vector Apoptosis Cartesian deadlock and suppress SDK warnings (#9937)"
- 2026-04-12T18:46:21Z @tobiu cross-referenced by PR #9938
- 2026-04-12T18:46:28Z @tobiu assigned to @tobiu
- 2026-04-12T18:49:35Z @tobiu closed this issue
- 2026-04-12T18:49:35Z @tobiu referenced in commit `7cff42e` - "fix(memory-core): Optimize Vector Apoptosis Cartesian deadlock and suppress SDK warnings (#9937) (#9938)"

