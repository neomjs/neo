---
id: 9791
title: 'feat(ai): Nativize memory core ingestion and standardize AST graph logic'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-08T16:22:44Z'
updatedAt: '2026-04-08T16:24:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9791'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T16:24:11Z'
---
# feat(ai): Nativize memory core ingestion and standardize AST graph logic

### Architectural Change: ChromaDB Deprecation & SQLite Native Migration
Successfully completed the bridge moving all temporal Memory Core execution out of legacy Python ChromaDB infrastructure and natively into `neo-sqlite`:
1. Rescued ~8,000 legacy episodic memories (730 sessions) via extracting them from Chroma, manually aligning them into our strict 4096D format via MLX Qwen3 embeddings, and importing them directly into the internal SQLite matrix `neo_agent_sessions_data`.
2. Created high-performance SQLite importer/rescue utilities in `/buildScripts/ai/` to bypass MCP boundaries during large volumetric data ingestions.
3. Activated REM-Sleep synthesis natively pointing solely to local SQLite Edge logic via `DreamService`.

### AST Node Taxonomy Consistency
1. Stripped `@class` and `@extends` annotations universally across all Node execution components within `buildScripts/ai/*`.
2. Replaced documentation headers universally with `@module` following the *Anchor & Echo* knowledgebase enhancement strategy. This mitigates AST topology contamination, ensuring the `FileSystemIngestor` natively parses scripts into isolated `File` structures containing isolated `Function` nodes rather than grouping them hierarchically as pseudo-classes inside the native knowledge graph.

## Timeline

- 2026-04-08T16:22:45Z @tobiu added the `enhancement` label
- 2026-04-08T16:22:45Z @tobiu added the `ai` label
- 2026-04-08T16:22:53Z @tobiu assigned to @tobiu
- 2026-04-08T16:23:54Z @tobiu referenced in commit `47cfb50` - "feat(ai): Nativize memory core ingestion and standardize AST graph logic (#9791)"
### @tobiu - 2026-04-08T16:24:09Z

Migration to native Edge Graph database completed. AST mappings normalized across build scripts. Branch pushed to remote.

- 2026-04-08T16:24:11Z @tobiu closed this issue
- 2026-04-08T17:27:00Z @tobiu referenced in commit `15e1365` - "fix(ai): disable autoGoldenPath in runSandman to prevent redundant REM synthesis (#9791)"

