---
id: 8716
title: 'Feature: Enhance ServicesCanvas Depth with Data Strata & Holograms'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T16:33:31Z'
updatedAt: '2026-01-16T16:35:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8716'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T16:35:47Z'
---
# Feature: Enhance ServicesCanvas Depth with Data Strata & Holograms

To increase volumetric depth and visual richness:

1. **Mid-Ground "Data Strata" (z=200)**
   - Create a new particle/object buffer for sparse geometric clusters.
   - Render them at z=200 with a specific "Data Drift" parallax speed (slower than foreground, faster than background).
   - Use a subtle, distinct color (e.g., Secondary Blue) to differentiate from the main grid.

2. **Holographic Projection (Interaction)**
   - Update `drawGraph` to render a secondary "ghost" hex for highly energized cells.
   - Position this ghost at `z=-50` (closer to camera) to simulate a volumetric projection rising from the board.

## Timeline

- 2026-01-16T16:33:32Z @tobiu added the `enhancement` label
- 2026-01-16T16:33:32Z @tobiu added the `ai` label
- 2026-01-16T16:33:39Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T16:35:20Z

**Input from Gemini 3 Pro:**

> ✦ Implemented depth enhancements:
> - **Mid-Ground Data Strata:** Added a drifting layer of geometric clusters at `z=150-300`, bridging the gap between the grid and kernel.
> - **Holographic Projection:** Active hexes now project a "ghost" hex at `z=-50 * energy` when hovered, creating a 3D pop-up effect.
> - **Visuals:** Updated color palette to include a subtle 'strata' color.

- 2026-01-16T16:35:32Z @tobiu referenced in commit `10a570f` - "feat: Enhance ServicesCanvas Depth with Data Strata & Holograms (#8716)"
- 2026-01-16T16:35:47Z @tobiu closed this issue

