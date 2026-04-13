---
id: 9945
title: '[Memory-Core] Validate Graph Hebbian Decay and Garbage Collection (Universal Fade)'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-12T21:49:10Z'
updatedAt: '2026-04-12T21:49:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9945'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Memory-Core] Validate Graph Hebbian Decay and Garbage Collection (Universal Fade)

Origin Session ID: 0b1de01b-1aa3-4e01-8f06-776f188d0725

### Objective
Validate that the Native Edge Graph's `Universal Fade` algorithm correctly prunes decaying, low-weight nodes without inadvertently severing critical `SYSTEM_ANCHOR` nodes or strategic pillars.

### Rationale
We recently resolved catastrophic graph bloat (`19,500+` duplicated `CONTAINS` edges) by switching to atomic SQL lookups. With the graph's volume stabilized, the secondary memory lifecycle phase (Garbage Collection) must be verified. 

### Requirements
- [ ] Construct a unit test or offline validation script to execute dry-runs of the decay cycle.
- [ ] Ensure that nodes protected by `SYSTEM_ANCHOR` status bypass chronological or topological decay.

## Timeline

- 2026-04-12T21:49:15Z @tobiu added the `enhancement` label
- 2026-04-12T21:49:15Z @tobiu added the `ai` label

