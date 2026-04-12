---
id: 9912
title: 'bug(ai): Debug sqlite-vec metadata schema to restore DreamService Hash Bypass'
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
# bug(ai): Debug sqlite-vec metadata schema to restore DreamService Hash Bypass

# Restore MD5 Hash Caching in DreamService

### Context
Since migrating to `sqlite-vec`, `runSandman.mjs` is unnecessarily re-embedding every OPEN issue. The metadata extraction payload `exMeta.hash === contentHash` is failing natively. 

### Objective
We must identify if `sqlite-vec` natively returns `.metadatas` structurally different from Chroma, and update the condition to correctly skip redundant LLM token processing.

## Timeline

- 2026-04-12T11:37:19Z @tobiu added the `bug` label
- 2026-04-12T11:37:19Z @tobiu added the `ai` label
- 2026-04-12T11:37:19Z @tobiu added the `core` label

