---
id: 9742
title: Add Config Flag for Differential Graph Sync (FileSystem Ingestor)
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-06T19:03:57Z'
updatedAt: '2026-04-06T19:06:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9742'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T19:06:00Z'
---
# Add Config Flag for Differential Graph Sync (FileSystem Ingestor)

### Description
Enable differential synchronization of the `neo.db` SQLite Graph against the local file system on startup, configured via explicit boolean environment features. We need the ability to conditionally prevent or enforce this parsing depending on the environment.

### Implementation Overview
- Adds `autoIngestFileSystem` flag (`false` by default) to `config.template.mjs`.
- Enables the flag to `true` locally inside `config.mjs`.
- Updates `GraphService.initAsync()` to conditionally trigger `FileSystemIngestor.syncWorkspaceToGraph()` upon `memory-core` MCP server boot.

## Timeline

- 2026-04-06T19:03:59Z @tobiu added the `enhancement` label
- 2026-04-06T19:04:00Z @tobiu added the `ai` label
- 2026-04-06T19:04:55Z @tobiu referenced in commit `ce8ba69` - "feat: Add environment toggle for differential graph sync (#9742)"
- 2026-04-06T19:05:47Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-06T19:05:58Z

Successfully added the `autoIngestFileSystem` flag to the config logic and bridged it into the `GraphService` boot sequence. Verified implementation and pushed to `dev`.

- 2026-04-06T19:06:00Z @tobiu closed this issue

