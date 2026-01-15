---
id: 8655
title: Enhance Header Canvas Shockwave Physics & Interaction
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T21:26:57Z'
updatedAt: '2026-01-14T22:10:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8655'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T22:10:57Z'
---
# Enhance Header Canvas Shockwave Physics & Interaction

## Objective
Elevate the "Shockwave" effect from a simple visual overlay to a physics-based interaction that affects the entire canvas ecosystem. Additionally, ensure the effect triggers consistently on all toolbar elements, including buttons.

## Features
1.  **Wave Displacement:** Active shockwaves should physically displace the "Split Stream" energy strands, creating a traveling pulse (amplitude spike) that follows the shockwave ring.
2.  **Particle Repulsion:** The "Ether" particles should be repelled by the expanding shockwave front, brightening momentarily to simulate energy transfer.
3.  **Universal Interaction:** Ensure clicks on `Neo.button.Base` items (which might stop propagation) still trigger the shockwave. This requires implementing `capture: true` listeners on the `HeaderToolbar`.

## Implementation
-   **HeaderCanvas.mjs (SharedWorker):** Update `calculateStrandGeometry` and `drawParticles` to factor in `shockwaves` state.
-   **HeaderToolbar.mjs (AppWorker):** Switch `click` listener to use `{options: {capture: true}}`.


## Timeline

- 2026-01-14T21:26:59Z @tobiu added the `enhancement` label
- 2026-01-14T21:26:59Z @tobiu added the `ai` label
- 2026-01-14T21:27:54Z @tobiu assigned to @tobiu
- 2026-01-14T21:28:58Z @tobiu referenced in commit `58ace87` - "feat: Implement interactive Shockwave Physics (Wave & Particle displacement) & Fix Button Clicks (#8655)"
- 2026-01-14T22:09:35Z @tobiu referenced in commit `46d48f8` - "refactor: Move HeaderToolbar event logic to Controller & Enable background shockwaves (#8655)"
- 2026-01-14T22:10:02Z @tobiu added parent issue #8630
### @tobiu - 2026-01-14T22:10:36Z

**Input from Gemini 3 Pro:**

> ✦ **Completed Shockwave Physics & Interaction Enhancements**
> 
> **1. Visual Physics Upgrade (SharedWorker)**
> - **Wave Displacement:** Shockwaves now physically displace the main energy strands, creating a traveling amplitude pulse that follows the expanding ring.
> - **Particle Repulsion:** The "Ether" particles are now dynamically repelled and brightened by the shockwave front, creating a cohesive physical reaction across all visual layers.
> 
> **2. Robust Interaction (AppWorker)**
> - **Controller-Based Handling:** Refactored `HeaderToolbar` to use a dedicated `HeaderToolbarController`.
> - **Button Clicks:** Bypassed DOM bubbling limitations by wiring button handlers directly to the controller (`handler: 'onButtonClick'`). This ensures every click, whether on a button or the background, triggers the effect.
> - **View Cleanup:** Removed all imperative logic from the `HeaderToolbar` view, enforcing a strict separation of concerns.

- 2026-01-14T22:10:58Z @tobiu closed this issue

