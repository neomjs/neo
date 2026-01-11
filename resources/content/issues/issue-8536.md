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
updatedAt: '2026-01-11T12:45:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8536'
author: tobiu
commentsCount: 2
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

- 2026-01-11T11:00:41Z @tobiu referenced in commit `1483170` - "#8536 basic setup"
### @tobiu - 2026-01-11T12:44:45Z

**Input from Gemini 3 Pro:**

> ✦ **Timeline Animation: Implementation & Scaling Challenges**
> 
> We have made significant progress in rendering the "Neural Pulse" animation but are facing persistent alignment issues due to the interaction between the absolute-positioned canvas and the variable-height content layout.
> 
> **Current Status:**
> 1.  **Architecture:**
>     -   `TimelineCanvas` runs in a dedicated worker, rendering a spine, pulse, and nodes.
>     -   `CanvasWrapper` overlays the canvas on top of the content (`z-index: 2`, `pointer-events: none`).
>     -   `PageContainer` and `CanvasWrapper` have been refactored to use `layout: null` (block) and `overflow: visible` to ensure the wrapper grows with the content, preventing canvas clipping.
> 
> 2.  **Logic:**
>     -   `TimelineCanvas.mjs` synchronizes with DOM updates by querying `getDomRect` for all timeline items.
>     -   It dynamically calculates `nodeY` based on `rect.y` relative to the canvas.
>     -   It uses `record.tag` to apply different vertical offsets for "Comments" (Avatar center) vs "Events" (Badge center).
> 
> **The Issue:**
> -   **Drift/Scaling:** Even with correct offsets, the markers visually drift (appear too high/low) as we move down the timeline.
> -   **Diagnosis:** The logs suggest `CanvasWrapper` height matches the content, but the visual result implies a coordinate mismatch. This usually happens when the canvas *resolution* (width/height attributes) does not perfectly match its *display size* (CSS width/height), causing the browser to scale the drawing.
> -   **Specifics:** `getDomRect` returns the correct screen coordinates, but the mapping to canvas internal coordinates seems desynchronized, possibly due to race conditions during resize or flexbox constraints in `MainContainer`.
> 
> **Next Steps (Debugging with Neural Link):**
> To fix this efficiently in the next session, we must stop guessing offsets and rely on hard data.
> 
> 1.  **Use Neural Link to Inspect Dimensions:**
>     -   Query `get_computed_styles` for `neo-container-7` (Wrapper) and `neo-markdown-1` (Content) to ensure they are **identical** in height.
>     -   Query `get_dom_rect` for `neo-canvas-1` (Canvas) and `neo-container-7` (Wrapper) to ensure the canvas is not being clipped or stretched by a parent container.
> 
> 2.  **Verify Canvas Resolution:**
>     -   In `TimelineCanvas.mjs`, log `this.el.width` and `this.el.height` (internal resolution) vs `this.el.getBoundingClientRect().height` (display size). If they differ, `updateSize` logic needs fixing.
> 
> 3.  **Check Scroll Offset:**
>     -   Verify if `canvasRect.y` changes as expected during scroll. If the canvas is attached to the scrolling content, `rect.y - canvasRect.y` should be constant. If it's attached to the viewport, it's not.
> 
> **Recommendation:**
> Start the next session by inspecting the **Canvas Element properties** directly to confirm 1:1 pixel mapping. The logic is sound, but the DOM environment is introducing a scaling factor.


