---
id: 9778
title: Integrate Real-Time Turn-by-Turn Memory Parsing
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-08T09:31:46Z'
updatedAt: '2026-04-08T10:18:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9778'
author: tobiu
commentsCount: 0
parentIssue: 9777
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T10:18:01Z'
---
# Integrate Real-Time Turn-by-Turn Memory Parsing

Migrate from Map-Reduce batch constraints to real-time ingestion by updating `MemoryService.addMemory` to execute real-time single-turn extraction via `DreamService`. This sets the architectural foundation for subsequent schema modifications.

## Timeline

- 2026-04-08T09:31:47Z @tobiu added the `enhancement` label
- 2026-04-08T09:31:48Z @tobiu added the `ai` label
- 2026-04-08T09:31:48Z @tobiu added the `architecture` label
- 2026-04-08T09:32:04Z @tobiu added parent issue #9777
- 2026-04-08T09:32:32Z @tobiu referenced in commit `47f80ad` - "feat: Integrate Real-Time Turn-by-Turn Memory Parsing (#9778)"
- 2026-04-08T10:17:58Z @tobiu assigned to @tobiu
- 2026-04-08T10:18:02Z @tobiu closed this issue

