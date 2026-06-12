---
id: 8647
title: Explore 3D Effects for Header Canvas (Neon Tube vs Ribbon)
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T19:04:50Z'
updatedAt: '2026-01-14T19:10:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8647'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T19:10:18Z'
---
# Explore 3D Effects for Header Canvas (Neon Tube vs Ribbon)

Explore and implement 3D visualization techniques for the Header Canvas sine waves to enhance the "Application Engine" feel.

**Objectives:**
1. **Neon Tube Effect:** Add a high-intensity white core to the energy strands to simulate cylindrical volume and lighting.
2. **Ribbon Effect:** Fill the area between the intertwining strands to create a twisting 3D surface structure.
3. **Refactor:** Decouple physics calculation from rendering to allow multi-pass drawing (Fill then Stroke) using the same point data.

**Approach:**
- Modify `Portal.canvas.HeaderCanvas` in `apps/portal/canvas/HeaderCanvas.mjs`.
- Separate the point generation loop from the drawing loop.
- Implement a `drawRibbon()` pass using `createLinearGradient` to fill the space between strands.
- Implement a `drawNeonStrands()` pass overlaying the ribbon with multi-layered strokes (Glow + Color + White Core).

## Timeline

- 2026-01-14T19:04:52Z @tobiu added the `enhancement` label
- 2026-01-14T19:04:52Z @tobiu added the `ai` label
- 2026-01-14T19:04:59Z @tobiu added parent issue #8630
- 2026-01-14T19:09:35Z @tobiu referenced in commit `b0b0dd1` - "feat: Implement 3D Neon Ribbon effect for Header Canvas (#8647)"
- 2026-01-14T19:09:58Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T19:10:02Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the "Combined Approach" for the Header Canvas 3D effect:
> 1.  **Refactored** `drawAuras` to decouple point calculation (`calculateStrandPoints`) from rendering.
> 2.  **Ribbon Fill:** Added a subtle gradient fill between the two strands to simulate a twisting 3D surface.
> 3.  **Neon Tube:** Implemented a multi-pass stroke (Glow + White Core) to give the strands a volumetric, light-emitting appearance.
> 
> The result is a richer, more "engineered" visual that aligns with the "Application Engine" theme.

- 2026-01-14T19:10:18Z @tobiu closed this issue

