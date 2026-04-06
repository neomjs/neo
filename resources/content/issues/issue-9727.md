---
id: 9727
title: Semantic Refactoring of Memory Core Configuration
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-05T23:13:04Z'
updatedAt: '2026-04-05T23:57:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9727'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-05T23:48:06Z'
---
# Semantic Refactoring of Memory Core Configuration

### Problem
The current memory core configuration (`config.mjs`) relies on misleading naming conventions: `memoryDb` and `sessionDb` are structurally defined as databases, when logically they are just collections/tables that live inside a physical database engine. Furthermore, `ChromaManager` uses eager initialization, meaning a simple file import triggers a background daemon `run` command—causing crash issues for unit tests where a server start is a fatal side behavior.

### Proposed Solution
1. **Semantic Separation:** Decouple physical Engine routing from logical Collection schemas. We will introduce `engines.neo` and `engines.chroma` for directory and port routing, alongside a standalone `collections` block for table naming configurations.
2. **Unified Backup Topology:** Stick strictly to `.jsonl` data backups, creating a top-level `backupPath` across engines to prevent raw Chroma database folder copying/bloat.
3. **Service Migration:** Reconcile 8 existing framework files and build scripts to cleanly route to the semantic API paths.

## Timeline

- 2026-04-05T23:13:06Z @tobiu added the `enhancement` label
- 2026-04-05T23:13:06Z @tobiu added the `ai` label
- 2026-04-05T23:13:06Z @tobiu added the `refactoring` label
- 2026-04-05T23:13:06Z @tobiu added the `architecture` label
- 2026-04-05T23:13:22Z @tobiu assigned to @tobiu
- 2026-04-05T23:23:35Z @tobiu cross-referenced by #9728
- 2026-04-05T23:47:58Z @tobiu referenced in commit `e12ee23` - "refactor: Semantic Refactoring of Memory Core Configuration (#9727)"
### @tobiu - 2026-04-05T23:48:06Z

Architecture definition decoupled successfully and backwards compatibility for base sdk verified via SQLite Vector native.

- 2026-04-05T23:48:06Z @tobiu closed this issue

