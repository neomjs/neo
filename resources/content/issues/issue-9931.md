---
id: 9931
title: Refactor DreamService to Finalize Two-Pillar Hybrid RAG
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-12T16:34:34Z'
updatedAt: '2026-04-12T19:03:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9931'
author: tobiu
commentsCount: 0
parentIssue: 9922
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-12T17:02:25Z'
---
# Refactor DreamService to Finalize Two-Pillar Hybrid RAG

### Architectural Context
During Epic #9922, the monolithic `SQLiteVectorManager` was deprecated in favor of a Two-Pillar Hybrid RAG architecture using ChromaDB for semantic storage and SQLite for pure graphical structural topologies via `StorageRouter`.

However, the offline GraphRAG daemon (`DreamService.mjs`) was not fully refactored, causing `DreamService` and its respective Playwright test specs to crash when attempting to dynamically resolve the deleted module.

### Core Objectives
1. Eliminate all dynamic and static imports coupling `DreamService` to `SQLiteVectorManager`.
2. Refactor `synthesizeGoldenPath()` to decouple the raw SQL JOIN that mapped structural and semantic spaces. The daemon must now fetch `k` semantic nodes natively from ChromaDB via `StorageRouter`, securely project those IDs into a bounded SQLite query to evaluate `struct_score`, and merge the hybrid `priority` cleanly in JavaScript.
3. Update `DreamService` test mocks to accurately emulate the Two-Pillar architecture.

## Timeline

- 2026-04-12T16:34:35Z @tobiu added the `enhancement` label
- 2026-04-12T16:34:35Z @tobiu added the `ai` label
- 2026-04-12T16:34:42Z @tobiu added parent issue #9922
- 2026-04-12T16:54:19Z @tobiu referenced in commit `cb74810` - "docs: Anchor & Echo mapping logic for EdgeGraph topology (#9931)"
- 2026-04-12T16:54:30Z @tobiu cross-referenced by PR #9932
- 2026-04-12T17:02:24Z @tobiu referenced in commit `ff9c4f6` - "docs: Anchor & Echo mapping logic for EdgeGraph topology (#9931) (#9932)"
- 2026-04-12T17:02:25Z @tobiu closed this issue
- 2026-04-12T19:03:14Z @tobiu assigned to @tobiu

