---
id: 8630
title: 'Epic: Header Toolbar Canvas Overlay (Sonic Waves)'
state: CLOSED
labels:
  - enhancement
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T13:38:41Z'
updatedAt: '2026-01-15T00:52:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8630'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 8631 Scaffold Header Canvas Architecture'
  - '[x] 8632 Implement Sonic Wave Visual Effects'
  - '[x] 8633 Fix HeaderCanvas navRects TypeError'
  - '[x] 8634 Fix HeaderCanvas Invalid Input Data Structure'
  - '[x] 8635 Tune Sonic Wave Visuals'
  - '[x] 8636 Enhance Header Canvas with Gradient Helix Theme'
  - '[x] 8638 Strict Vertical Clamping for Header Waves'
  - '[x] 8637 Add Vertical Padding to Header Canvas Waves'
  - '[x] 8639 Implement Dynamic Life Effects for Header Canvas'
  - '[x] 8641 Refine Header Canvas Dynamics (Phase & FM)'
  - '[x] 8642 Adaptive Wave Geometry for Social Icons'
  - '[x] 8643 Dampen Wave Amplitude for Social Icons'
  - '[x] 8644 Add Synaptic Sparks at Reconnection Points'
  - '[x] 8645 Implement Neo Ether Particle System'
  - '[x] 8646 Enhance JSDoc for Header Canvas Visual Engine'
  - '[x] 8647 Explore 3D Effects for Header Canvas (Neon Tube vs Ribbon)'
  - '[x] 8648 Apply Ribbon Effect to Background Helix'
  - '[x] 8649 Enhance JSDoc for Header Canvas 3D Effects'
  - '[x] 8650 Clean up HeaderCanvas Comments (Remove Thought Chains)'
  - '[x] 8651 Optimize HeaderCanvas Rendering (GC & Gradients)'
  - '[x] 8652 Document Zero-Allocation Architecture in HeaderCanvas'
  - '[x] 8653 Throttle MouseMove Events in HeaderCanvas'
  - '[x] 8655 Enhance Header Canvas Shockwave Physics & Interaction'
  - '[x] 8654 Optimize Global MouseMove with rAF Throttling'
  - '[x] 8656 Refactor HeaderCanvas: ComponentManager, SCSS, and JSDoc'
  - '[x] 8657 Docs: Create ''Advanced Canvas Architecture'' Guide'
  - '[x] 8660 HeaderCanvas: Visualize Active View State'
subIssuesCompleted: 27
subIssuesTotal: 27
blockedBy: []
blocking: []
closedAt: '2026-01-15T00:52:49Z'
---
# Epic: Header Toolbar Canvas Overlay (Sonic Waves)

## Objective
Implement a high-performance, offscreen canvas overlay for the Portal's `HeaderToolbar` to create immersive, interactive visual effects ("Sonic Waves") on navigation items.

## Strategic Value
- **Showcase:** immediately demonstrates "Application Engine" capabilities (multithreading, offscreen canvas) on the landing page.
- **UX:** Elevates the first impression from "static web page" to "interactive runtime."

## Scope
1. **Architecture:**
   - Create `Portal.view.HeaderCanvas`: An App Worker component to coordinate DOM rect synchronization and lifecycle.
   - Create `Portal.canvas.HeaderCanvas`: A Shared Worker singleton to handle the physics simulation and rendering loop.

2. **Features:**
   - **Sonic Wave Effect:** Implement a shader-like or particle-based effect that reacts to cursor proximity.
   - **Interaction:**
     - **Hover:** Subtle energy buildup or wave distortion around the hovered item.
     - **Click:** distinct ripple or pulse effect.
   - **Responsive:** Ensure the canvas overlay adapts perfectly to window resizing and layout changes.

3. **Integration:**
   - Overlay the existing `HeaderToolbar` without disrupting its functionality or accessibility.
   - Efficiently bridge `mouseenter`/`mouseleave` events from the App Worker to the Canvas Worker.


## Timeline

- 2026-01-14T13:38:42Z @tobiu added the `enhancement` label
- 2026-01-14T13:38:43Z @tobiu added the `epic` label
- 2026-01-14T13:38:43Z @tobiu added the `ai` label
- 2026-01-14T13:40:18Z @tobiu added sub-issue #8631
- 2026-01-14T14:17:19Z @tobiu added sub-issue #8632
### @tobiu - 2026-01-14T15:21:21Z

**Input from Gemini 3 Pro:**

> ✦ All sub-tasks are complete. The Sonic Wave canvas overlay is implemented and active on the Portal HeaderToolbar.
> - Scaffolded App/Shared worker architecture.
> - Implemented DOM synchronization for toolbar items.
> - Implemented physics-based rendering loop (Auras & Shockwaves).

- 2026-01-14T15:23:39Z @tobiu added sub-issue #8633
- 2026-01-14T15:29:10Z @tobiu added sub-issue #8634
- 2026-01-14T15:58:12Z @tobiu added sub-issue #8635
- 2026-01-14T16:45:58Z @tobiu added sub-issue #8636
- 2026-01-14T16:53:49Z @tobiu added sub-issue #8638
- 2026-01-14T16:56:11Z @tobiu added sub-issue #8637
- 2026-01-14T17:12:40Z @tobiu added sub-issue #8639
- 2026-01-14T17:21:03Z @tobiu added sub-issue #8641
- 2026-01-14T17:28:59Z @tobiu added sub-issue #8642
- 2026-01-14T17:40:27Z @tobiu added sub-issue #8643
- 2026-01-14T17:42:59Z @tobiu added sub-issue #8644
- 2026-01-14T18:03:38Z @tobiu added sub-issue #8645
- 2026-01-14T18:33:40Z @tobiu added sub-issue #8646
- 2026-01-14T19:04:59Z @tobiu added sub-issue #8647
- 2026-01-14T19:12:23Z @tobiu added sub-issue #8648
- 2026-01-14T19:18:10Z @tobiu added sub-issue #8649
- 2026-01-14T19:27:12Z @tobiu added sub-issue #8650
- 2026-01-14T19:32:44Z @tobiu added sub-issue #8651
- 2026-01-14T19:44:07Z @tobiu added sub-issue #8652
- 2026-01-14T19:53:23Z @tobiu added sub-issue #8653
- 2026-01-14T22:10:02Z @tobiu added sub-issue #8655
- 2026-01-14T22:11:39Z @tobiu added sub-issue #8654
- 2026-01-14T23:12:50Z @tobiu added sub-issue #8656
- 2026-01-14T23:35:22Z @tobiu added sub-issue #8657
- 2026-01-15T00:43:41Z @tobiu added sub-issue #8660
- 2026-01-15T00:52:43Z @tobiu assigned to @tobiu
- 2026-01-15T00:52:50Z @tobiu closed this issue

