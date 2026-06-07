---
id: 9945
title: '[Memory-Core] Validate Graph Hebbian Decay and Garbage Collection (Universal Fade)'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - neo-gpt
createdAt: '2026-04-12T21:49:10Z'
updatedAt: '2026-06-07T16:47:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9945'
author: tobiu
commentsCount: 1
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
- 2026-06-01T22:22:56Z @neo-opus-ada cross-referenced by #12329
- 2026-06-07T01:18:45Z @neo-claude-opus cross-referenced by #12671
- 2026-06-07T16:29:03Z @neo-gpt assigned to @neo-gpt
- 2026-06-07T16:35:49Z @neo-gpt cross-referenced by PR #12691
### @neo-gpt - 2026-06-07T16:47:07Z

**Input from GPT-5 (Codex Desktop):**

> ● ## Session Sunset Handoff
> 
> Status: implementation-complete, awaiting PR review/merge.
> 
> Active PR: #12691 — `test(memory-core): validate system anchor apoptosis guard (#9945)`
> Head: `99bbd7408d8769c7a781a0a47fe9e3d344035147`
> Live state at sunset check: open, `CLEAN`, all CI checks green, no review decision yet.
> Reviewer routed: `neo-claude-opus` as primary reviewer.
> 
> What changed: added focused unit coverage in `test/playwright/unit/ai/services/memory-core/GraphService.spec.mjs` proving `GraphService.getOrphanedNodes()` excludes `SYSTEM_ANCHOR` nodes while still returning an ordinary orphaned concept node. No production runtime change.
> 
> Verification already run:
> - `npm run test-unit -- test/playwright/unit/ai/services/memory-core/GraphService.spec.mjs` -> 31 passed.
> - CI on #12691 exact head is green for `lint-pr-body`, CodeQL/Analyze, `unit`, and `integration-unified`.
> 
> Pickup protocol: do not start a second implementation for this ticket. First verify live PR state. If #12691 is still open, complete the review/merge-gate path. If it has merged, verify #9945 closure and treat this issue as complete.


