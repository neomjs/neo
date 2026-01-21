---
id: 8702
title: Implement ServicesCanvas with Glassmorphism for Portal Services Section
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T11:52:58Z'
updatedAt: '2026-01-16T12:46:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8702'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T12:46:42Z'
---
# Implement ServicesCanvas with Glassmorphism for Portal Services Section

To polish the Services section of the Portal app, we will implement a new 'ServicesCanvas' using OffscreenCanvas.

Visual Concept: "The Architect's Grid" - A slow-moving, 3D-like geometric lattice or connected node graph representing Structure, Stability, and Engineering.

Implementation Details:
1.  **Canvas Worker**: Create `apps/portal/canvas/ServicesCanvas.mjs` for the rendering logic.
2.  **App Worker**: Create `apps/portal/view/services/Canvas.mjs` to manage the canvas lifecycle and interactions.
3.  **Helper**: Update `apps/portal/canvas/Helper.mjs` to register the new canvas.
4.  **View**: Update `apps/portal/view/services/Component.mjs` to include the canvas and switch to a "Glassmorphism" UI layout.
5.  **Styling**: Update SCSS to support the new visual hierarchy.

## Timeline

- 2026-01-16T11:52:59Z @tobiu added the `enhancement` label
- 2026-01-16T11:52:59Z @tobiu added the `design` label
- 2026-01-16T11:53:00Z @tobiu added the `ai` label
- 2026-01-16T12:43:45Z @tobiu referenced in commit `6d01b77` - "fix: Enhance ServicesCanvas contrast and align hover effects (#8702)"
### @tobiu - 2026-01-16T12:43:47Z

**Input from Gemini 3 Pro:**

> ✦ **Visual Refinements:**
> 1.  **Canvas Contrast:** Increased line opacity from 0.08 to 0.15 in `ServicesCanvas.mjs` to ensure the grid is visible against the light gray background of the `neo-light` theme.
> 2.  **UI Consistency:** Updated `resources/scss/src/apps/portal/services/Component.scss` to match the hover effects of the Home section's content boxes (`translateY(-5px)` and `box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1)`).
> 
> This should address the visibility and consistency feedback.

- 2026-01-16T12:46:16Z @tobiu referenced in commit `8faeca8` - "feat: Implement ServicesCanvas and Glassmorphism UI (#8702)"
- 2026-01-16T12:46:18Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T12:46:23Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Architect's Grid" visualization and Glassmorphism UI for the Services section.
> 
> **Changes:**
> 1.  **New Canvas:** Created `apps/portal/canvas/ServicesCanvas.mjs` running in a SharedWorker. It renders a subtle, oscillating 3D-like node grid with increased contrast for visibility.
> 2.  **App Worker View:** Created `apps/portal/view/services/Canvas.mjs` to bridge the DOM and the SharedWorker.
> 3.  **Helper Update:** Registered the new canvas in `apps/portal/canvas/Helper.mjs`.
> 4.  **UI Overhaul:** Updated `apps/portal/view/services/Component.mjs` to use a `Canvas` background and wrapped content in `portal-glass-card` containers.
> 5.  **Styling:** Added `resources/scss/src/apps/portal/services/Component.scss` with glassmorphism effects and hover states aligned with the Home section.
> 6.  **Theme Support:** Added variables in `resources/scss/theme-neo-light/apps/portal/services/Component.scss`.
> 
> The result is a polished, consistent look that aligns with the Home and Ticket sections.

- 2026-01-16T12:46:43Z @tobiu closed this issue

