---
id: 9843
title: 'feat: Implement Quantitative Reward Signal for Golden Path Edge Reinforcement'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-10T07:16:39Z'
updatedAt: '2026-04-10T07:17:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9843'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[ ] 9842 feat: Implement Autonomous Agent Orchestrator with Golden Path Directive Injection'
blocking: []
---
# feat: Implement Quantitative Reward Signal for Golden Path Edge Reinforcement

## Problem (A2A Context — Claude Opus 4.6 via Antigravity)

The Golden Path synthesis (`DreamService.synthesizeGoldenPath()`) computes strategic priorities using a hybrid `(semanticScore * 2.0) + (struct_score * 1.0)` formula, but edge weights are static after computation. There is no feedback loop from task execution outcomes back into the scoring algorithm.

When an agent completes a Golden Path task:
- If successful: the ticket closes, the node leaves the OPEN filter, but the structural edges that led to its prioritization retain their weights unchanged
- If failed: the ticket remains open, the agent moves on, but no penalty signal adjusts the weights

This means the system cannot learn from its own execution history. A task that consistently fails keeps getting re-prioritized. A task category where the agent excels doesn't get proportionally reinforced.

## Solution

Implement a `RewardService` in `ai/mcp/server/memory-core/services/RewardService.mjs`:

### 1. Outcome Capture (in `Loop.reflect()`)

After each completed cycle, compute a quantitative outcome signal:

```javascript
const signal = {
    taskId    : event.goldenPathNodeId,  // The graph node that spawned this task
    outcome   : 'success' | 'partial' | 'failure',
    metrics   : {
        testsPassed    : Number,   // If QA sub-agent ran tests
        testsTotal     : Number,
        filesModified  : Number,
        commitSha      : String|null,
        executionTimeMs: Number
    }
};
```

### 2. Edge Weight Mutation

Feed the signal back into GraphService:

- **Success**: `linkNodes(completedNodeId, relatedNodes, 'REWARD_POSITIVE', outcome.score)` — strengthens the structural pathways that led to this task
- **Failure**: Apply decay multiplier (e.g., 0.7) to the inbound `GUIDES` edges from the frontier to the failed node — deprioritizes repeated failure
- **Partial**: No weight change (neutral signal)

### 3. Golden Path Recalibration

The next `synthesizeGoldenPath()` run will automatically pick up the mutated edge weights via the existing `struct_score` SQL aggregation, naturally deprioritizing failed tasks and reinforcing successful patterns.

## Architectural Context

- `ai/agent/Loop.mjs` (L441-469): `reflect()` — the existing reflection hook where outcome capture should be injected
- `ai/mcp/server/memory-core/services/GraphService.mjs` (L173-228): `linkNodes()` — the Hebbian edge weight accumulation that the reward signal should target
- `ai/daemons/DreamService.mjs` (L929-988): The Golden Path SQL query that consumes `struct_score` — already wired to pick up edge weight changes

## Avoided Pitfalls

- Do NOT create a separate database for reward signals — use the existing Native Edge Graph topology. The whole point is that rewards flow through the same edges the Golden Path traverses.
- Do NOT use semantic reward (LLM judging quality) — use quantitative metrics only. Semantic reward introduces hallucination risk into the feedback loop.
- Protect against reward hacking: cap maximum positive reinforcement per cycle (already handled by `Math.min(..., 5.0)` in `linkNodes`)
- The `REWARD_POSITIVE` edge type should NOT be decayed by `decayGlobalTopology()` — add it to the protected list alongside `IMPLEMENTS`, `EXTENDS`, `SYSTEM_TENET`

## Verification

- Unit test: `test/playwright/unit/ai/RewardService.spec.mjs`
  - Assert: Success signal increases target edge weight
  - Assert: Failure signal decays target edge weight
  - Assert: Repeated failure eventually drops node below Golden Path threshold

## Timeline

- 2026-04-10T07:16:41Z @tobiu added the `enhancement` label
- 2026-04-10T07:16:42Z @tobiu added the `ai` label
- 2026-04-10T07:16:42Z @tobiu added the `architecture` label
- 2026-04-10T07:17:15Z @tobiu cross-referenced by #9844
- 2026-04-10T07:17:45Z @tobiu assigned to @tobiu
- 2026-04-10T07:18:00Z @tobiu marked this issue as being blocked by #9842

