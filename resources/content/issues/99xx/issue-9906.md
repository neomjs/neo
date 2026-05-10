---
id: 9906
title: 'Sub-Task: Graph Topology Linkage (TEST -> VALIDATES -> CLASS)'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-12T10:10:31Z'
updatedAt: '2026-04-12T10:10:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9906'
author: tobiu
commentsCount: 0
parentIssue: 9904
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Sub-Task: Graph Topology Linkage (TEST -> VALIDATES -> CLASS)

### Context
As part of the [Epic: RLAIF Reward Function and Model Orchestration Pipeline](#9904), we need to formally construct the metadata relations inside the Vector database. 

### Task
Implement **Graph Topology Linkage**. We must extend the SQLite Vector Database Schema to formally support a triangular mapping topology:
`TEST` Node → `VALIDATES` (Edge) → `CLASS` Node.

When `DreamService` generates `*.spec.mjs` files that cover generic classes, this linkage ensures the Swarm Intelligence can natively query exactly which tests map to which framework components, setting the stage for edge-weight modifications (Reward Propagation).

### References
- **Origin Session ID**: `8f55968e-45d3-4012-ba2f-d1757061e1d2`
- **Parent Epic**: #9904

## Timeline

- 2026-04-12T10:10:33Z @tobiu added the `enhancement` label
- 2026-04-12T10:10:33Z @tobiu added the `ai` label
- 2026-04-12T10:10:41Z @tobiu added parent issue #9904
- 2026-04-12T10:10:49Z @tobiu cross-referenced by #9907

