---
id: 8718
title: 'Feature: Add color diversity to ServicesCanvas debris'
state: CLOSED
labels:
  - enhancement
  - ai
  - 'agent-task:completed'
assignees:
  - tobiu
createdAt: '2026-01-16T17:13:56Z'
updatedAt: '2026-01-17T18:31:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8718'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T18:31:00Z'
---
# Feature: Add color diversity to ServicesCanvas debris

Update `apps/portal/canvas/ServicesCanvas.mjs` to support varied colors for debris particles.
- Expand `DEBRIS_STRIDE` to store a color index.
- Define a palette of brand-aligned colors.
- Randomize color assignment in `spawnDebris`.
- Update `drawDebris` to render using specific particle colors.

## Timeline

- 2026-01-16T17:13:57Z @tobiu added the `enhancement` label
- 2026-01-16T17:13:57Z @tobiu added the `ai` label
- 2026-01-16T17:34:09Z @tobiu referenced in commit `ea83abf` - "feat: Add color diversity to ServicesCanvas grid and runners (#8718)"
### @tobiu - 2026-01-16T17:34:42Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Blue-Scale" color diversity for debris, runners, and grid cells.
> - **Debris:** Randomly assigned from a palette of White/Off-White, Cyan, Neo Blue, and Purple.
> - **Runners:** Randomly assigned from a palette of Cyan, Indigo, Neo Blue, and Turquoise.
> - **Grid Nodes:** Inherit the color of the Runner that activates them.
> - **Theme:** "Blue-Scale" palette ensures cohesion with the Neo.mjs brand identity.
> - **Contrast:** `hexLine` visibility has been increased for better structure.
> 
> The changes are committed in `ea83abfcf`.

- 2026-01-16T17:35:27Z @tobiu added the `agent-task:completed` label
- 2026-01-17T18:30:55Z @tobiu assigned to @tobiu
- 2026-01-17T18:31:00Z @tobiu closed this issue

