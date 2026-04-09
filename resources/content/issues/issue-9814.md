---
id: 9814
title: Fix "undefined" Agent OS Graph Nodes in DreamService Gap Analysis
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-09T09:49:01Z'
updatedAt: '2026-04-09T09:49:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9814'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T09:49:38Z'
---
# Fix "undefined" Agent OS Graph Nodes in DreamService Gap Analysis

### The Problem
The `sandman_handoff.md` file was generating `undefined` identifiers when logging Codebase Gaps via the REM Dream pipeline. This structural corruption disrupted the Native Edge Graph topological mapping and resulted from a property mapping mismatch during the TTL pruning cycle.

### The Architectural Reality
The error originated in `ai/mcp/server/memory-core/services/DreamService.mjs` (around line 1005). The `DreamService` was iterating over `GraphService.db.nodes.items` and accessing `node.name`. Native nodes from SQLite map directly to an internal structure containing `id`, `label`, and `properties`. There is no root-level `name` property (it is stored mapping to `properties.name`).

**File fixed:**
- `ai/mcp/server/memory-core/services/DreamService.mjs`

### The Fix & Avoided Traps
Instead of globally refactoring the graph schema to hoist `.name` or applying a generic fallback logic (a "Gold Standard" LLM trap that can clutter Neo.mjs core), I targeted the most architecturally stable identifier: `node.id` string map (e.g., `CLASS:Learning_Section_Markdown_Component`). This natively protects the GraphRAG ingestion logs from ambiguity. The file has been modified to use `` \`${node.id}\` ``.

## Timeline

- 2026-04-09T09:49:02Z @tobiu added the `bug` label
- 2026-04-09T09:49:02Z @tobiu added the `ai` label
- 2026-04-09T09:49:20Z @tobiu assigned to @tobiu
- 2026-04-09T09:49:36Z @tobiu referenced in commit `fbd2e7b` - "fix(ai): Resolve undefined Graph Nodes in DreamService Gap Analysis (#9814)"
### @tobiu - 2026-04-09T09:49:37Z

The native graph mapping issue in DreamService has been fixed by safely targeting the `node.id` representation mapped directly from the sqlite vector db, replacing the previous hallucination-prone `node.name` approach. Code is fully pushed!

- 2026-04-09T09:49:39Z @tobiu closed this issue

