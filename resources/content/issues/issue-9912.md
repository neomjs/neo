---
id: 9912
title: 'bug(ai): Prevent Vector Apoptosis from eradicating structural entities'
state: OPEN
labels:
  - bug
  - ai
  - core
assignees: []
createdAt: '2026-04-12T11:37:19Z'
updatedAt: '2026-04-12T11:37:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9912'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# bug(ai): Prevent Vector Apoptosis from eradicating structural entities

### Context
`runSandman.mjs` is unnecessarily re-embedding every OPEN issue and discussion during the REM extraction pipeline. We originally suspected `sqlite-vec` metadata formatting, but the root cause is that `GraphService.getOrphanedNodes()` considers any node without edges to be "orphaned" and permanently deletes it via Vector Apoptosis. 

### Objective
Update `GraphService.getOrphanedNodes()` to explicitly protect structural entities like `ISSUE`, `DISCUSSION`, and `PULL_REQUEST` from apoptosis, so they remain in the Native Edge Graph and ChromaDB, successfully passing the hash equality bypass on subsequent runs.

## Timeline

- 2026-04-12T11:37:19Z @tobiu added the `bug` label
- 2026-04-12T11:37:19Z @tobiu added the `ai` label
- 2026-04-12T11:37:19Z @tobiu added the `core` label

