---
id: 8697
title: Implement Reference Viewport Scaling for HomeCanvas
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T05:39:55Z'
updatedAt: '2026-01-16T05:50:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8697'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T05:50:12Z'
---
# Implement Reference Viewport Scaling for HomeCanvas

The `HomeCanvas` simulation currently uses absolute pixel values for physics, sizes, and distances. This leads to inconsistent experiences across devices:
- **Large Screens:** Sparse graph, slow relative movement.
- **Small Screens:** Overcrowded graph, fast chaotic movement.

This ticket implements a **Reference Viewport Strategy** to ensure consistency:
1.  **Dynamic Scale Factor:** Calculate `this.scale = Math.sqrt((width * height) / (1920 * 1080))` on resize.
2.  **Scaled Rendering:** Apply `this.scale` to:
    - Node radii and stroke widths.
    - Connection distances and interaction radii.
    - Particle sizes (agents, packets, sparks).
    - Velocities and forces (maintaining relative speed).
3.  **Density Management:** Cull background layers (`layer === 0`) on small screens (low scale factor) to reduce visual noise.

**Goal:** A consistent "Neural Swarm" aesthetic and pacing, regardless of the device resolution.

## Timeline

- 2026-01-16T05:39:57Z @tobiu added the `enhancement` label
- 2026-01-16T05:39:57Z @tobiu added the `ai` label
- 2026-01-16T05:49:04Z @tobiu referenced in commit `45a7c97` - "feat: Implement reference viewport scaling for HomeCanvas (#8697)"
- 2026-01-16T05:49:13Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T05:49:31Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the **Reference Viewport Strategy** to ensure a consistent experience across all device sizes.
> 
> **Key Changes:**
> 1.  **Dynamic Scale Factor:** `HomeCanvas` now calculates a `scale` property on resize, normalized against a standard **1920x1080** viewport.
>     - `scale = 1.0` on Full HD desktop.
>     - `scale < 1.0` on mobile/tablets.
>     - `scale > 1.0` on 4K displays.
> 
> 2.  **Scaled Visuals:**
>     - Node radii, connection line widths, and stroke weights now scale linearly.
>     - Visual elements maintain their relative size and weight regardless of screen density.
> 
> 3.  **Scaled Physics:**
>     - Velocity vectors, forces, and distances are now multiplied by `scale`.
>     - The "perceived speed" of agents and drifting nodes remains consistent (e.g., an agent takes roughly the same time to cross the screen on a phone as on a desktop).
>     - Interaction radii (mouse hover, shockwave range) are also scaled, making interactions feel natural on touch screens.
> 
> 4.  **Density Management:**
>     - Added a culling check in `drawNetwork`: `if (s < 0.5 && layer === 0) continue;`.
>     - On very small screens (scale < 0.5), the background layer of nodes is hidden. This prevents the "dot soup" effect and improves clarity on mobile devices.
> 
> The simulation now adapts fluidly from mobile to 4K, maintaining the intended "Neural Swarm" aesthetic and pacing.

- 2026-01-16T05:50:13Z @tobiu closed this issue

