---
id: 9798
title: Native Memory Core Graph Topology Export
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-08T21:36:07Z'
updatedAt: '2026-04-08T21:40:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9798'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T21:36:53Z'
---
# Native Memory Core Graph Topology Export

### The Problem
While standardizing the `memory-core` snapshot strategy, we realized that only the episodic `memories` and `summaries` vector collections were captured. The Native Edge Graph topology (storing runtime relationships, Nodes, and Edges) inside SQLite remained isolated and was omitted from the unified `.neo-ai-data/backups/` export directory. Without serializing the graph alongside the vectors, downstream swarm clusters could suffer from "context amnesia" upon loading cold backups.

### The Architectural Reality
The native Knowledge Graph leverages specific tables (`Nodes`, `Edges`) isolated inside `SQLite.mjs`, which differs structurally from traditional LanceDB/Chroma schemas. 
File modifications involve:
- `ai/mcp/server/memory-core/services/DatabaseService.mjs`: Augmented to explicitly query the `GraphService.db.storage.db` and synchronously pipe data to `graph-backup-[timestamp].jsonl`.
- Stream termination logic was fortified explicitly wrapping `writeStream.end(resolve)` in Promises to ensure that fast-exiting lifecycle scripts (`exportDatabase.mjs`) don't prematurely kill the pipe buffer before reaching the disk.

### Avoided Anti-Patterns & False 'Gold Standards'
1. **Purity of Context Collections**: We intentionally avoided routing the graph through `StorageRouter.mjs`. While they share a database, the vector collections and the edge graph are structurally different. Building a generic router catch-all compromises the deterministic querying capabilities native directly to the Graph schema.
2. **Synchronous Buffer Ejection**: Previously, `process.exit(0)` truncated Node.js streams silently. Implementing deterministic `await new Promise(...)` checkpoints bypasses brittle event-emitter architectures while guaranteeing payload delivery regardless of execution environment speed.


## Timeline

- 2026-04-08T21:36:08Z @tobiu added the `enhancement` label
- 2026-04-08T21:36:08Z @tobiu added the `ai` label
- 2026-04-08T21:36:09Z @tobiu added the `architecture` label
- 2026-04-08T21:36:13Z @tobiu assigned to @tobiu
- 2026-04-08T21:36:40Z @tobiu referenced in commit `7ac271b` - "feat: Native Memory Core Graph Topology Export (#9798)"
### @tobiu - 2026-04-08T21:36:47Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ The Native Graph topology export has been successfully implemented and validated. Modifying `DatabaseService.mjs` allows the `#exportGraph` process to extract explicit `Nodes` and `Edges` schemas to `.jsonl`. Furthermore, `wait` promises were injected into the write streams to synchronously await file buffer draining prior to Node loop exit, successfully preventing `.jsonl` payload truncation. 
> 
> Changes have been pushed to the remote repository.

- 2026-04-08T21:36:53Z @tobiu closed this issue

