---
id: 9802
title: Dynamic Gravity Weighting for External and Bug Tickets in Hybrid GraphRAG
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-08T23:40:12Z'
updatedAt: '2026-04-08T23:40:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9802'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T23:40:49Z'
---
# Dynamic Gravity Weighting for External and Bug Tickets in Hybrid GraphRAG

## Problem
By default, the `DreamService` assigns a generic topological weight of `1.0` to all OPEN issues during the `ingestIssueStates` phase. This generic gravity fails to distinguish between a "nice to have" internal epic and a critical, community-reported regression, pulling the agent towards generating new features instead of resolving technical debt.

## Proposed Strategy
Implement cumulative gravitational context boosts in the Native Edge Graph.
1. **Community Multiplier (+0.5):** Boost the edge weight if the issue author is external (not `tobiu` or `neo-mjs-swarm`) AND the issue has been triaged (contains at least one label).
2. **Bug Multiplier (+1.0):** Boost the edge weight if the issue possesses the `bug` label, forcing the Context Priming Engine to prioritize regression fixes.

## Implementation Standard
Modify `DreamService.mjs` directly where edge properties are re-asserted for OPEN issues.

## Timeline

- 2026-04-08T23:40:14Z @tobiu added the `enhancement` label
- 2026-04-08T23:40:14Z @tobiu added the `ai` label
- 2026-04-08T23:40:36Z @tobiu referenced in commit `474fba3` - "feat: Add dynamic gravity weighting for external and bug tickets (#9802)"
- 2026-04-08T23:40:42Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-08T23:40:43Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Implementation merged and pushed. The `DreamService` Native Graph pipeline now successfully applies cumulative edge weights for external authors and bug labels naturally shifting Context Priming away from pure theoretical internal work and back towards community friction points.

- 2026-04-08T23:40:49Z @tobiu closed this issue

