---
id: 8854
title: Implement Footer OffscreenCanvas Overlay
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-21T16:52:11Z'
updatedAt: '2026-01-21T19:25:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8854'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T19:25:50Z'
---
# Implement Footer OffscreenCanvas Overlay

# Implement Footer OffscreenCanvas Overlay: "The Event Horizon"

- **Concept:** "The Event Horizon" (Gravity Well). A visualization of the **Agent OS** core as a central singularity.
- **Goal:** "Stunning Reward". A high-impact, centralized visual that rewards centering the view on the footer.
- **Visuals:**
    - **Radial Field:** Particles spiral into a center point.
    - **Gravity Interaction:** Footer links act as "Local Gravity Wells" on hover, pulling particles out of the main stream.
    - **Atmosphere:** Grandiose, Heavy, "The Source".
- **Theme Awareness:** Must adapt to Light/Dark mode variables.

## Implementation Plan

1.  **SharedWorker Helper:**
    - Updated (`importFooterCanvas`).

2.  **App Worker Component:**
    - `apps/portal/view/home/FooterCanvas.mjs`.
    - **Enhancement:** Add `updateNavRects` to track footer button positions.

3.  **Renderer (SharedWorker):**
    - `apps/portal/canvas/FooterCanvas.mjs`.
    - **Physics:**
        - Global Attractor (Center).
        - Local Attractors (Hovered Buttons).
        - Spaghettification effect.

4.  **View Integration:**
    - `apps/portal/view/home/FooterContainer.mjs`.
    - `resources/scss/src/apps/portal/home/FooterContainer.scss`.

## Timeline

- 2026-01-21T16:52:13Z @tobiu added the `enhancement` label
- 2026-01-21T16:52:13Z @tobiu added the `design` label
- 2026-01-21T16:52:13Z @tobiu added the `ai` label
- 2026-01-21T17:01:04Z @tobiu assigned to @tobiu
- 2026-01-21T17:01:08Z @tobiu added parent issue #8727
- 2026-01-21T19:24:55Z @tobiu referenced in commit `6e448be` - "feat: Implement Neural Mesh Footer Overlay (#8854)"
- 2026-01-21T19:24:55Z @tobiu referenced in commit `bc884cf` - "feat: Enhance Footer Canvas with Event Horizon and Gravity Interaction (#8854)"
### @tobiu - 2026-01-21T19:25:17Z

Implemented the 'Event Horizon' concept with Gravity Interaction.
- **Physics:** Radial spiral with acceleration.
- **Interaction:** Hovered buttons act as gravity wells, pulling particles in.
- **Polish:** Added transient gravity boost for snappy switching and refined visuals for legibility.

- 2026-01-21T19:25:50Z @tobiu closed this issue
- 2026-01-21T19:46:15Z @tobiu referenced in commit `43a2bbc` - "fix: Refine Footer Canvas physics (Partial Capture, Engine Rev) (#8854)"

