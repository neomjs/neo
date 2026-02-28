---
id: 8943
title: 'Feat: Interactive Living Sparklines'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-02T00:25:52Z'
updatedAt: '2026-02-02T01:33:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8943'
author: tobiu
commentsCount: 2
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-02T01:33:08Z'
---
# Feat: Interactive Living Sparklines

Transform the static sparkline into an interactive, high-performance visualization using the Canvas Worker engine.

### Objectives
1.  **Interaction:** Implement a "Time Scanner" that tracks the mouse cursor across the canvas, snapping to the nearest data point (Year/Value).
2.  **Visualization:** Render a dynamic "scanner line" and a "glowing intersection point" on hover.
3.  **Canvas Text:** Render the value/year directly on the canvas (avoiding DOM tooltip overhead).
4.  **Theming:** Implement a theme-aware color system (like `TicketCanvas`) to support future light/dark modes.
5.  **Performance:** Ensure the loop is efficient (only rendering when needed or using shared resources).

### Technical Approach
- **App Worker:** Forward `mousemove` and `mouseleave` events from `SparklineComponent` to the worker.
- **Canvas Worker:**
    - Implement `getPointAtX` math to snap to the Bezier curve.
    - Render the overlay (Scanner + Text) on top of the cached static chart.
    - Use `requestAnimationFrame` only when interaction is active.
    - Define a static `colors` map with `light` and `dark` palettes.

## Timeline

- 2026-02-02T00:25:53Z @tobiu added the `enhancement` label
- 2026-02-02T00:25:53Z @tobiu added the `design` label
- 2026-02-02T00:25:53Z @tobiu added the `ai` label
- 2026-02-02T00:26:10Z @tobiu added parent issue #8930
- 2026-02-02T01:31:24Z @tobiu referenced in commit `f406eed` - "feat: Interactive Living Sparklines with optimized theming and performance (#8943)"
### @tobiu - 2026-02-02T01:31:46Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the **Interactive Living Sparklines** feature with advanced canvas engine capabilities.
> 
> ### Key Enhancements
> 1.  **Canvas Engine Refactoring:**
>     -   Refactored `SparklineComponent` to use a **Wrapper Pattern** (`div > canvas`), ensuring robust layout and event handling.
>     -   Implemented a **SharedWorker-based Render Loop** in `Sparkline.mjs` with cached geometry and optimized paint cycles.
>     -   Added **High-DPI (Retina) support** by synchronizing `devicePixelRatio` from the main thread via `Neo.config` updates.
> 
> 2.  **Interaction Design:**
>     -   **Time Scanner:** A vertical laser line tracks the mouse cursor, snapping to the nearest data point.
>     -   **Data Overlay:** Displays the exact Year and Contribution Value on hover, rendered directly on the canvas for performance.
>     -   **Smart Layout:** Text alignment adjusts dynamically near edges to prevent clipping.
> 
> 3.  **Visual Polish:**
>     -   **Smooth Curves:** Replaced linear segments with quadratic Bezier curves.
>     -   **Gradient Fill:** Added a vertical gradient under the curve to add volume.
>     -   **Theming:** Implemented a `colors` map supporting `light` and `dark` modes with semantic color slots (`textYear`, `textValue`).
>     -   **Markers:** Added a subtle glowing end-point and removed distracting peak markers in the resting state.
> 
> 4.  **Integration:**
>     -   Updated `GridContainer` to use the new component.
>     -   Moved all static styles to SCSS (`resources/scss/src/apps/devrank/GridContainer.scss`).
>     -   Updated `src/worker/Manager.mjs` to detect and expose `devicePixelRatio` globally.
> 
> The result is a high-performance, interactive micro-chart that feels alive and responsive.

- 2026-02-02T01:31:53Z @tobiu assigned to @tobiu
- 2026-02-02T01:33:08Z @tobiu closed this issue
### @tobiu - 2026-02-02T01:33:56Z

**Input from Gemini 3 Pro:**

> ✦ **Important Release Note:**
> This feature introduces a new global configuration property: `Neo.config.devicePixelRatio`.
> This is automatically populated in `src/worker/Manager.mjs` by reading `window.devicePixelRatio` and is synchronized across all worker threads. This enables pixel-perfect canvas rendering on high-DPI (Retina) displays within App and Canvas workers.


