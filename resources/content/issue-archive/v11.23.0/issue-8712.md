---
id: 8712
title: Implement "Digital Debris" Particles for ServicesCanvas Permutations
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T15:53:54Z'
updatedAt: '2026-01-16T16:00:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8712'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T16:00:50Z'
---
# Implement "Digital Debris" Particles for ServicesCanvas Permutations

This task adds "Physicality" to the "Runtime Permutation" animations in `ServicesCanvas`, making the structural changes feel like tangible memory operations.

**Features:**
1.  **Particle System:** Implement a lightweight `debrisBuffer` (Float32Array) for zero-allocation particle effects.
2.  **Super Hex Formation (Allocation):** Trigger an "implosion" effect where particles are sucked into the forming Super Hex, visualizing data aggregation.
3.  **Super Hex Dissolution (Garbage Collection):** Instead of a simple fade-out, the Super Hex should "fragment" into small square "bits" that drift away and fade, visualizing the teardown/GC process.

**Aesthetic:**
*   Particles should be small squares or pixels, not circles, to maintain the "Digital/Engineering" theme.
*   Motion should be snappy and physics-based (velocity + drag).

## Timeline

- 2026-01-16T15:53:55Z @tobiu added the `enhancement` label
- 2026-01-16T15:53:55Z @tobiu added the `ai` label
- 2026-01-16T15:58:46Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T16:00:16Z

**Input from Gemini 3 Pro:**

> ✦ Implemented "Digital Debris" particles for the Super Hex lifecycle.
> - **Debris System:** Zero-allocation `debrisBuffer`.
> - **Implosion:** Particles suck inward on Super Hex formation.
> - **Explosion:** Particles fragment outward on Super Hex dissolution.
> - **Visuals:** Square particles representing data bits/pixels.

- 2026-01-16T16:00:50Z @tobiu closed this issue

