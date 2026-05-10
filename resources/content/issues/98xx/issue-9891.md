---
id: 9891
title: 'feat: Strategic Constraint Nodes for Golden Path directional control'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-11T19:22:59Z'
updatedAt: '2026-04-11T19:23:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9891'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# feat: Strategic Constraint Nodes for Golden Path directional control

## Context

The Golden Path synthesis in `DreamService.synthesizeGoldenPath()` ranks OPEN issues by a hybrid priority score:

```
priority = (1/(semantic_distance + 0.1) × SEMANTIC_WEIGHT) + (structural_edge_weight × STRUCTURAL_WEIGHT)
```

This is purely **reactive** — the frontier embedding is computed from the 2 most recent session summaries, so the swarm follows its own inertia. The only mechanism for intentional steering is `mutate_frontier`, which adjusts edge weights but cannot express **strategic vetoes** or **forced inclusions**.

## Problem

Three directional control patterns are currently impossible:

1. **No-Fly Zones:** "Don't touch Grid multi-body until the selection model is stabilized" — there's no way to exclude an entire component area from Golden Path candidacy without manually closing all related tickets.
2. **Priority Overrides:** "The Klarso.com migration is the #1 business priority regardless of graph topology" — strategic business priorities can't override mathematical rankings.
3. **Explore Zones:** "Stress-test the Canvas Worker integration even though no tickets exist" — the Golden Path is purely convergent (optimizes toward existing high-score nodes). There's no mechanism for intentional divergent exploration.

## A2A Context (Fat Ticket)

### Proposed Design

New node type `STRATEGIC_CONSTRAINT` with the following schema:

```javascript
{
    id: 'constraint:no-fly-grid-multibody',
    type: 'STRATEGIC_CONSTRAINT',
    name: 'Grid Multi-Body Stability Hold',
    properties: {
        constraint_type: 'NO_FLY_ZONE',  // or 'PRIORITY_OVERRIDE' or 'EXPLORE_ZONE'
        target_pattern: 'grid.*multi.*body',  // regex matched against node IDs/names
        reason: 'Selection model regression risk — hold until #9850 is resolved',
        created_by: 'tobiu',
        expires_at: '2026-05-01T00:00:00Z',  // optional TTL
        active: true
    }
}
```

### Integration Points

1. **`synthesizeGoldenPath()`** — After the hybrid SQL query returns `scoredNodes`, apply constraint filtering:
   - `NO_FLY_ZONE`: Remove matching nodes from candidacy entirely
   - `PRIORITY_OVERRIDE`: Inject matching nodes at the top with maximum score
   - `EXPLORE_ZONE`: Query the graph for nodes matching the pattern even if they're not OPEN issues, and add them as exploration candidates

2. **`mutate_frontier`** MCP tool — Extend to accept `constraint_type` as an optional parameter. When provided, creates a `STRATEGIC_CONSTRAINT` node instead of adjusting edge weights.

3. **`sandman_handoff.md`** — Add an "Active Strategic Constraints" section listing all non-expired constraints so agents understand the boundaries.

### Avoided Pitfalls

- Constraints must have optional TTL (`expires_at`) to prevent permanent strategic drift. The `runGarbageCollection()` method should prune expired constraints.
- `NO_FLY_ZONE` must not delete or modify the underlying nodes — it only filters them from Golden Path candidacy. The data remains for future analysis.
- `PRIORITY_OVERRIDE` should be used sparingly — it bypasses the mathematical ranking entirely.

## Verification Plan

1. Unit test: Create a `STRATEGIC_CONSTRAINT` node with `NO_FLY_ZONE`, run `synthesizeGoldenPath()`, assert the matching nodes are excluded from the top-3 output.
2. Unit test: Create a `PRIORITY_OVERRIDE` constraint, assert the target node appears at position 1 regardless of its mathematical score.
3. Integration: Verify constraints surface in `sandman_handoff.md` under a dedicated section.


## Timeline

- 2026-04-11T19:23:00Z @tobiu added the `enhancement` label
- 2026-04-11T19:23:00Z @tobiu added the `ai` label
- 2026-04-11T19:23:14Z @tobiu assigned to @tobiu

