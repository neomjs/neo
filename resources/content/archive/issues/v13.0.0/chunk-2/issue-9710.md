---
id: 9710
title: '[SQLite VSS Migration] 100% Offline Markdown Tensor Chunking'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-04T21:05:32Z'
updatedAt: '2026-04-04T22:27:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9710'
author: tobiu
commentsCount: 1
parentIssue: 9673
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T22:27:34Z'
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
- 2026-04-04T22:27:13Z @tobiu referenced in commit `f63e98c` - "feat: stabilize sqlite memory core via model decoupling and querying (#9710)"
- 2026-04-04T22:27:31Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-04T22:27:33Z

SQLite VSS Migration complete. Resolved type-locking requirements, implemented abstraction of TextEmbeddingService (decoupling generative and embedding contexts), and verified robust pre-filtering of attributes leveraging sqlite-vec bounds.

- 2026-04-04T22:27:34Z @tobiu closed this issue
- 2026-04-04T22:30:21Z @tobiu referenced in commit `c71fc11` - "chore: add throw logic for sqlite-vec native load failures (#9710)"

