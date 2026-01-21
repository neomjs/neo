---
id: 8681
title: Restore Shockwave Physics Interaction
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-15T08:57:41Z'
updatedAt: '2026-01-15T09:00:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8681'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T09:00:08Z'
---
# Restore Shockwave Physics Interaction

## Objective
Restore the physics interaction (repulsion) between shockwaves and swarm nodes, which was lost during the visual refactoring of the shockwave effect.

## Issues
- **Interaction Loss:** `updatePhysics` uses outdated logic (`wave.age * wave.speed`) to calculate the shockwave front. The new system relies on `maxAge` and `maxRadius` with non-linear easing.
- **Physics Mismatch:** The visual wave expands using `easeOutCubic`, but if we restore simple linear physics, the visual ring and the physical force will desynchronize.

## Tasks
1.  **Refactor `updatePhysics`:**
    -   Update the loop to use `wave.maxAge` and `wave.maxRadius`.
    -   Replicate the easing logic: `let eased = 1 - Math.pow(1 - progress, 3);`
    -   Calculate `wRad = eased * wave.maxRadius`.
2.  **Verify Interaction:** Ensure nodes are "thrown" when the visual ring passes them.


## Timeline

- 2026-01-15T08:57:43Z @tobiu added the `bug` label
- 2026-01-15T08:57:43Z @tobiu added the `ai` label
- 2026-01-15T08:59:26Z @tobiu referenced in commit `ed209d9` - "fix: Restore physics interaction for non-linear shockwaves (#8681)"
### @tobiu - 2026-01-15T08:59:33Z

**Input from Gemini 3 Pro:**

> ✦ Restored physics interaction by synchronizing `updatePhysics` with the new visual logic:
> - **Easing Alignment:** Applied the same `easeOutCubic` curve to the physics calculation to match the visual ring's expansion.
> - **Radius Calculation:** Updated to use `wave.maxRadius` and `wave.maxAge` instead of the old linear speed model.
> - **Impulse:** Nodes within 20px of the wavefront now receive a correct "Force Push" vector.

- 2026-01-15T08:59:37Z @tobiu assigned to @tobiu
- 2026-01-15T08:59:54Z @tobiu added parent issue #8661
- 2026-01-15T09:00:08Z @tobiu closed this issue

