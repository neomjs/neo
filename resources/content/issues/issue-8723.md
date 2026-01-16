---
id: 8723
title: 'ServicesCanvas: Upgrade ''Runners'' to ''Neural Agents'''
state: OPEN
labels:
  - enhancement
  - design
  - ai
assignees: []
createdAt: '2026-01-16T18:07:07Z'
updatedAt: '2026-01-16T18:07:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8723'
author: tobiu
commentsCount: 0
parentIssue: 8721
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# ServicesCanvas: Upgrade 'Runners' to 'Neural Agents'

**Context:**
Currently, `ServicesCanvas.mjs` features "Runners"—dots that zip along the grid lines blindly. They represent simple data packets or network traffic.

**Goal:**
Upgrade these entities to represent "Neural Agents" that actively maintain and inspect the runtime.

**Requirements:**
1.  **Agency:** Agents should not just move; they should *act*.
2.  **Scanning Behavior:** When an Agent reaches a node (random chance or deterministic), it should:
    *   Stop or slow down significantly.
    *   Trigger a "Scan" animation (e.g., expanding ring or color pulse).
    *   Change the state of the node (e.g., permanently change its color to "Optimized" or boost its energy).
3.  **Visuals:** Give them a distinct visual signature (e.g., a "Head" with a "Tail", similar to `HomeCanvas`, but adapted for the Hex grid).
4.  **Zero-Allocation:** Ensure this new behavior maintains the strict zero-allocation policy (use pre-allocated buffers).


## Timeline

- 2026-01-16T18:07:08Z @tobiu added the `enhancement` label
- 2026-01-16T18:07:08Z @tobiu added the `design` label
- 2026-01-16T18:07:08Z @tobiu added the `ai` label
- 2026-01-16T18:07:27Z @tobiu added parent issue #8721

