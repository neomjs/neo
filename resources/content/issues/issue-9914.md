---
id: 9914
title: 'Epic: Native Edge Graph Auditing and Deduplication Pipeline'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees: []
createdAt: '2026-04-12T11:37:21Z'
updatedAt: '2026-04-12T19:10:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9914'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[x] 9912 bug(ai): Prevent Vector Apoptosis from eradicating structural entities'
blocking:
  - '[ ] 9904 Epic: RLAIF Reward Function and Model Orchestration Pipeline'
---
# Epic: Native Edge Graph Auditing and Deduplication Pipeline

### Context
The SQLite memory matrix has rapidly scaled past 50,000 raw memory nodes. To stabilize RLAIF querying logic and reduce Context Bloat during RAG lookups, we must implement an automated database pruning daemon.

### Scope
- Cleanse duplicate string mappings.
- Identify orphaned scalar `CONTAINS` edges.
- Provide a `vacuum` / `compact` abstraction over the memory matrix to speed up memory-core operations.

## Timeline

- 2026-04-12T11:37:26Z @tobiu added the `epic` label
- 2026-04-12T11:37:27Z @tobiu added the `ai` label
- 2026-04-12T11:37:27Z @tobiu added the `architecture` label
- 2026-04-12T11:40:03Z @tobiu marked this issue as being blocked by #9912
- 2026-04-12T11:40:06Z @tobiu marked this issue as blocking #9904

