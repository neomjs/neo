---
id: 9649
title: 'Sub-Epic 3A: Create DreamService.mjs in memory-core'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-03T11:04:23Z'
updatedAt: '2026-04-03T11:07:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9649'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-03T11:07:21Z'
---
# Sub-Epic 3A: Create DreamService.mjs in memory-core

Implement the core `DreamService.mjs` running internally within the `memory-core` MCP server. This service acts as the "Hippocampus", retrieving recent un-processed episodic session memories from Chroma DB schemas, and preparing them for offline batch inferences (REM cycle).
Parent Epic: #9641

## Timeline

- 2026-04-03T11:04:25Z @tobiu added the `enhancement` label
- 2026-04-03T11:04:25Z @tobiu added the `ai` label
- 2026-04-03T11:06:51Z @tobiu referenced in commit `90c2e7d` - "feat: Implement DreamService ingestion loop skeleton (#9649)"
- 2026-04-03T11:07:19Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-03T11:07:20Z

Implemented DreamService.mjs skeleton, integrated it into Server.mjs lifecycle and config.mjs.

- 2026-04-03T11:07:21Z @tobiu closed this issue

