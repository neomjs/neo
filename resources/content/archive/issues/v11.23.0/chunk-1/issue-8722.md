---
id: 8722
title: 'ServicesCanvas: Refactor ''Debris'' to ''Construction'' Visuals'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T18:06:54Z'
updatedAt: '2026-01-16T19:38:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8722'
author: tobiu
commentsCount: 1
parentIssue: 8721
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T18:11:34Z'
---
# ServicesCanvas: Refactor 'Debris' to 'Construction' Visuals

**Context:**
Currently, `ServicesCanvas.mjs` uses a `spawnDebris` method that creates an explosion effect when a "Super Hex" finishes its lifecycle. This visual metaphor implies instability or destruction.

**Goal:**
Refactor the visual effect to represent "Construction" or "Crystallization". The Neo.mjs engine builds persistent objects; it doesn't blow them up.

**Requirements:**
1.  Rename/Refactor `spawnDebris` to something like `spawnConstructionEffects` or `visualizeAssembly`.
2.  **Implosion (Creation):** When a Super Hex starts forming (`state === 0`), particles should implode *smoothly* and *precisely* into the center, "locking" the structure in place.
3.  **Completion (End):** When a Super Hex finishes (`state === 2`), instead of exploding outward, it should perhaps "dissolve" into the grid (fade out) or "upload" (move up on Z-axis), leaving the grid intact.
4.  **Palette:** Ensure all particles use the Blue-Scale palette (Cyan, Neo Blue, White). Remove Purple/Indigo unless it represents a specific "AI" state.


## Timeline

- 2026-01-16T18:06:56Z @tobiu added the `enhancement` label
- 2026-01-16T18:06:56Z @tobiu added the `design` label
- 2026-01-16T18:06:56Z @tobiu added the `ai` label
- 2026-01-16T18:07:25Z @tobiu added parent issue #8721
### @tobiu - 2026-01-16T18:10:32Z

**Input from Gemini 3 Pro:**

> ✦ Completed refactoring of 'Debris' to 'Construction Particles'.
> - Replaced explosion logic with a 'Construction Implosion' and 'Upload Dissolve' effect.
> - Upgraded particle physics to support 3D (Z-axis) movement.
> - Enforced strict Blue-Scale palette.
> - Renamed all relevant methods and buffers.

- 2026-01-16T18:11:13Z @tobiu referenced in commit `4b480df` - "feat(ServicesCanvas): Refactor 'Debris' to 'Construction' Visuals (#8722)"
- 2026-01-16T18:11:34Z @tobiu closed this issue
- 2026-01-16T19:17:30Z @tobiu cross-referenced by #8721
- 2026-01-16T19:38:19Z @tobiu assigned to @tobiu

