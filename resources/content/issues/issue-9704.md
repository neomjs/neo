---
id: 9704
title: 'Feat: Sandman Graph Physics (Hebbian Reinforcement & Global Ambient Decay)'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-04T19:25:03Z'
updatedAt: '2026-04-04T19:25:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9704'
author: tobiu
commentsCount: 0
parentIssue: 9671
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Sandman Graph Physics (Hebbian Reinforcement & Global Ambient Decay)

This issue resolves structural logic gaps inside the Native Edge Graph and the Sandman REM Pipeline to enable true Artificial Subconscious capabilities.

### Current Flaws
1. Additive accumulation is missing Hebbian Learning limits, resulting in a graph with no weight-based neural hierarchy.
2. Background Offline Digestion produces "Context Ghosts", bypassing the SQLite structural decay mechanism.
3. The strategically generated `Golden Path` is a single monolithic Markdown string rather than distinct structural graph nodes.

### Required Implementation
1. Modify `GraphService.mjs` -> `linkNodes()`:
   - Apply Hebbian Reinforcement by incrementing weight by `+0.1` on duplicates (Max Ceiling `5.0`).
2. Add `GraphService.mjs` -> `decayGlobalTopology(-5%)`:
   - Implement a background loop applying a `0.95x` multiplier over the entire SQLite Graph edge table, deleting paths dropping below `< 0.2`.
3. Update `DreamService.mjs`:
   - Discontinue generating monolithic `GoldenPath.md`.
   - Force the LLM to output discrete Strategic JSON Nodes and `upsertNode` each into the `frontier`.

This forms an executable sequence to harden "Phase 3: Subconscious Strategy Layer".

## Timeline

- 2026-04-04T19:25:06Z @tobiu added the `enhancement` label
- 2026-04-04T19:25:06Z @tobiu added the `ai` label
- 2026-04-04T19:25:06Z @tobiu added the `architecture` label
- 2026-04-04T19:25:11Z @tobiu added parent issue #9671

