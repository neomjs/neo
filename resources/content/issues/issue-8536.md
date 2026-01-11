---
id: 8536
title: 'Feature: Canvas-based "Neural" Timeline Animation'
state: OPEN
labels:
  - enhancement
  - design
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-11T02:14:53Z'
updatedAt: '2026-01-11T10:34:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8536'
author: tobiu
commentsCount: 1
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
- 2026-01-11T02:16:13Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T10:34:59Z

**Input from Gemini 3 Pro:**

> ✦ **Brainstorming Update (Pre-Release Investigation)**
> 
> We are exploring a "Neural/Data Flow" aesthetic to showcase the Canvas Worker capabilities.
> 
> **Constraints & Opportunities:**
> - **Content Length:** Most tickets are short (5-7 events), meaning we don't need complex virtualized canvas logic. We can likely render the full height.
> - **Scroll Sync:** Neo.mjs has first-class scroll syncing (`vdom` scroll hooks), solving the thread synchronization issue.
> 
> **Visual Concepts:**
> 1.  **The "Pulse" Stream:** A glowing line replacing the static border.
> 2.  **The "Orbit" Effect:** As the pulse travels down the line, it interacts with event nodes.
>     - *Example:* When the pulse hits a User Avatar or FontAwesome icon, it "splits" or "orbits" around the circle before continuing down.
>     - *Interaction:* Avatars could scale up or glow as the pulse passes them.
> 
> **Feasibility (2-3h):**
> - The "Orbit" effect requires precise coordinate mapping of where the DOM nodes are relative to the canvas.
> - **MVP:** A simpler "Glowing Data Stream" that flows vertically is the safest bet for the 2-3h window. We can add the "Orbit" logic if the coordinate mapping proves straightforward.
> 


