---
id: 8791
title: Create Portal.canvas.Base to standardize Canvas Workers
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-19T00:17:36Z'
updatedAt: '2026-01-19T00:44:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8791'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T00:44:03Z'
---
# Create Portal.canvas.Base to standardize Canvas Workers

Create a `Portal.canvas.Base` class to abstract common logic for the four Portal canvases (`HeaderCanvas`, `HomeCanvas`, `ServicesCanvas`, `TicketCanvas`).

**Goals:**
- **Standardize `initGraph`:** Implement the polling logic and the `!me.animationId` guard in the base class.
- **Standardize `updateSize`:** Centralize the canvas resizing logic.
- **Fix Theme Reactivity:** Use a reactive `theme_` config in the base class to ensure `afterSetTheme` (and resource updates) are triggered correctly for all canvases.
- **Reduce Boilerplate:** Remove repetitive code from the subclasses.

**Target Files:**
- `apps/portal/canvas/Base.mjs` (New)
- `apps/portal/canvas/HeaderCanvas.mjs`
- `apps/portal/canvas/HomeCanvas.mjs`
- `apps/portal/canvas/ServicesCanvas.mjs`
- `apps/portal/canvas/TicketCanvas.mjs`

## Timeline

- 2026-01-19T00:17:37Z @tobiu added the `ai` label
- 2026-01-19T00:17:37Z @tobiu added the `refactoring` label
- 2026-01-19T00:17:37Z @tobiu added the `architecture` label
- 2026-01-19T00:43:31Z @tobiu referenced in commit `a9883a7` - "refactor: standardize Portal canvases with new Base class (#8791)"
- 2026-01-19T00:43:35Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-19T00:43:40Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully created `Portal.canvas.Base` and refactored all four Portal canvases to extend it.
> 
> **Architectural Changes:**
> - **Centralized Logic:** `initGraph`, `clearGraph`, `updateSize`, `setTheme`, and `renderLoop` are now defined in `Portal.canvas.Base`.
> - **Standardized Initialization:** The base `initGraph` implements the robust polling mechanism and the critical `!me.animationId` guard to prevent duplicate render loops.
> - **Hook System:** Introduced `onGraphMounted(width, height)` hook in the base class, which `HeaderCanvas`, `HomeCanvas`, and `ServicesCanvas` use to initialize their specific resources (particles, nodes) after the context is ready.
> - **Reactive Theme:** The `theme_` config in `Base` is reactive, ensuring `afterSetTheme` is triggered correctly. It calls `updateResources` if the subclass implements it.
> - **Singleton Inheritance Fix:** Ensured `singleton: true` is defined in the subclasses (`HeaderCanvas`, `HomeCanvas`, `ServicesCanvas`, `TicketCanvas`) rather than the base class to allow proper extension.
> - **Cleanup:** Removed redundant method definitions and class fields from all four subclasses. `ServicesCanvas` and `HomeCanvas` correctly override `updateSize` to handle their specific scaling logic (including `me.scale` calculation and buffer resets), while `HeaderCanvas` and `TicketCanvas` rely on the base implementation.
> 
> **Files Created/Modified:**
> - `apps/portal/canvas/Base.mjs` (New)
> - `apps/portal/canvas/HeaderCanvas.mjs`
> - `apps/portal/canvas/HomeCanvas.mjs`
> - `apps/portal/canvas/ServicesCanvas.mjs`
> - `apps/portal/canvas/TicketCanvas.mjs`

- 2026-01-19T00:44:03Z @tobiu closed this issue

