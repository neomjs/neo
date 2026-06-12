---
id: 8677
title: Enhance Shockwave Visuals
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-15T03:29:28Z'
updatedAt: '2026-01-15T08:51:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8677'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T08:51:46Z'
---
# Enhance Shockwave Visuals

## Objective
Upgrade the "Force Push" (Shockwave) visual from a "boring single line" to a high-fidelity energy release.

## Tasks
1.  **Composite Wave:** Render multiple rings with different speeds and opacities (Primary Wave, Secondary Echo).
2.  **Distortion:** If possible, use a refraction-like effect (offsetting pixels?) or just simulate it with thick, glowing strokes.
3.  **Chromatic Aberration:** Draw the wave in Red, Green, and Blue with slight offsets to simulate lens dispersion.
4.  **Particles:** Spawn temporary "spark" particles at the wave front.

## Timeline

- 2026-01-15T03:29:29Z @tobiu assigned to @tobiu
- 2026-01-15T03:29:30Z @tobiu added the `enhancement` label
- 2026-01-15T03:29:30Z @tobiu added the `design` label
- 2026-01-15T03:29:30Z @tobiu added the `ai` label
- 2026-01-15T03:29:43Z @tobiu added parent issue #8661
- 2026-01-15T08:50:24Z @tobiu referenced in commit `df7d9fa` - "feat: Enhance shockwave visuals with composite rings and sparks (#8677)"
### @tobiu - 2026-01-15T08:50:55Z

**Input from Gemini 3 Pro:**

> ✦ Enhanced the shockwave visual to "High Fidelity" status:
> - **Composite Wave:** Uses `screen` blending with Red/Blue chromatic aberration fringes (0.99/1.01 scale) and a white-hot core.
> - **Physics:** Replaced linear expansion with `easeOutCubic` for a percussive "pop".
> - **Pressure Fill:** Added a subtle white fill (`alpha * 0.1`) inside the ring to simulate air density change.
> - **Data Debris:** Added 40+ spark trails (lines instead of dots) with drag/friction that burst outward from the impact.
> - **Glow:** Applied `shadowBlur` (10-20px) to all elements for an energy-field look.

- 2026-01-15T08:51:46Z @tobiu closed this issue

