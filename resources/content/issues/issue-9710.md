---
id: 9710
title: '[SQLite VSS Migration] 100% Offline Markdown Tensor Chunking'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-04T21:05:32Z'
updatedAt: '2026-04-04T21:05:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9710'
author: tobiu
commentsCount: 0
parentIssue: 9673
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [SQLite VSS Migration] 100% Offline Markdown Tensor Chunking

### Description
Phase 2 of the Memory Core overhaul. Evolve beyond containerized ChromaDB to a pure zero-dependency SQLite Vector DB driven by local `qwen3-embedding`.

### Acceptance Criteria
- Move Vector Storage to SQLite VSS native columns.
- Swap standard text embedding models to `qwen3-embedding`.
- Build a dedicated Semantic Markdown Chunking engine (basing chunks around `##` blocks and JSON keys, rather than AST parsing).
- Related to Epic #9673.

## Timeline

- 2026-04-04T21:05:33Z @tobiu added the `enhancement` label
- 2026-04-04T21:05:33Z @tobiu added the `ai` label
- 2026-04-04T21:05:33Z @tobiu added the `architecture` label
- 2026-04-04T21:05:44Z @tobiu added parent issue #9673

