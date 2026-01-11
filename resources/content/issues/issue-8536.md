---
id: 8536
title: 'Feature: Canvas-based "Neural" Timeline Animation'
state: OPEN
labels:
  - enhancement
  - design
  - ai
  - performance
assignees: []
createdAt: '2026-01-11T02:14:53Z'
updatedAt: '2026-01-11T02:14:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8536'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feature: Canvas-based "Neural" Timeline Animation

### Concept
Replace the static CSS border line in the Ticket Timeline with a `Neo.component.Canvas` rendered via the **Canvas Worker**.

### Goal
Showcase the Neo.mjs "Application Engine" capabilities by running a high-fidelity animation off the main thread without impacting scroll performance. This serves as a strong visual differentiator from static-site generators.

### Visual Style
A "Neural" or "Data Flow" aesthetic (Matrix/Sci-Fi vibes) that fits the Neo brand identity.

### Desired Behavior
1.  **Vertical Connection:** A continuous line connecting timeline items.
2.  **Animation:** An animated "pulse" or particle effect that travels down the line, simulating data flow.
3.  **Scroll Reactivity (Optional):** The animation speed or intensity could react to the user's scroll speed (faster scroll = faster flow).

### Technical Implementation
*   Create a `Portal.view.news.tickets.TimelineCanvas` component.
*   Position it absolutely behind or next to the timeline items within the `Component.mjs` structure.
*   Use the **Canvas Worker** to handle the animation loop (60fps).
*   Ensure synchronization with the scroll position of the main container so the canvas aligns perfectly with the DOM elements.

## Timeline

- 2026-01-11T02:14:54Z @tobiu added the `enhancement` label
- 2026-01-11T02:14:54Z @tobiu added the `design` label
- 2026-01-11T02:14:54Z @tobiu added the `ai` label
- 2026-01-11T02:14:54Z @tobiu added the `performance` label

