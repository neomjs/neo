---
id: 8723
title: 'ServicesCanvas: Upgrade ''Runners'' to ''Neural Agents'''
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T18:07:07Z'
updatedAt: '2026-01-16T19:07:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8723'
author: tobiu
commentsCount: 1
parentIssue: 8721
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T19:07:42Z'
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
- 2026-01-16T19:06:52Z @tobiu referenced in commit `44fdd75` - "feat: Upgrade Runners to Neural Agents with stateful Scanning behavior (#8723)"
### @tobiu - 2026-01-16T19:06:56Z

**Input from Gemini 3 Pro:**

> ✦ I have upgraded the Runners to Neural Agents with the following changes:
> 
> 1.  **Stateful Behavior:** Agents now implement a Moving/Scanning state machine.
> 2.  **Agency:** Agents have a 20% chance to stop and "Scan" a node upon arrival.
> 3.  **Visuals:**
>     *   **Head:** Agents now have a distinct Diamond-shaped head.
>     *   **Action:** Scanning triggers a Radar Pulse and Vertical Beam.
>     *   **Theme Awareness:** The Agent Head adapts to the theme (White in Dark Mode, Neo Blue in Light Mode) to ensure visibility, fixing the concern about white-on-white.
> 4.  **Logic:** A successful scan instantly boosts the node's `BuildCharge` by +5, guaranteeing a Super Hex trigger. This ensures visual cause-and-effect.
> 5.  **Zero-Allocation:** `RUNNER_STRIDE` was increased to 10 to store state and timers in the buffer.
> 
> The task is complete.

- 2026-01-16T19:07:21Z @tobiu cross-referenced by #8721
- 2026-01-16T19:07:29Z @tobiu assigned to @tobiu
- 2026-01-16T19:07:43Z @tobiu closed this issue

