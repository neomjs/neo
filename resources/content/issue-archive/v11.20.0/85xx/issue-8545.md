---
id: 8545
title: 'Enhancement: "Chameleon Pulse" & Render Loop Polish'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T13:59:12Z'
updatedAt: '2026-01-11T14:18:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8545'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T14:18:06Z'
---
# Enhancement: "Chameleon Pulse" & Render Loop Polish

- **Goal:** Elevate the timeline animation from visual decoration to semantic data visualization.
- **Concept (Chameleon Pulse):** The pulse should react to the *content* it passes.
    -   **Default:** Neo Blue (`rgba(64, 196, 255, 1)`).
    -   **Interaction:** When approaching/orbiting a node with a specific status color (e.g., Closed=Purple, Reopened=Green), the pulse should smoothly transition to that color.
- **Technical Polish:**
    -   Replace `setTimeout(..., 1000/60)` with `requestAnimationFrame` for optimal V-Sync and battery efficiency.
    -   Inject node-specific colors (based on icon class or raw record data) into the `nodes` array sent to the worker.
    -   Interpolate the `ctx.strokeStyle` gradient based on proximity.

## Timeline

- 2026-01-11T13:59:13Z @tobiu added the `enhancement` label
- 2026-01-11T13:59:13Z @tobiu added the `design` label
- 2026-01-11T13:59:13Z @tobiu added the `ai` label
- 2026-01-11T14:17:30Z @tobiu referenced in commit `98665fb` - "feat: Implement 'Chameleon Pulse' animation with data-driven colors (#8545)"
### @tobiu - 2026-01-11T14:17:41Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the "Chameleon Pulse" effect with robust data handling.
> 
> ### The Problem
> The animation was stuck on "Blue" because the `sections` store (driven by `ContentSection` model) was stripping out the `color` property from the timeline data.
> 
> ### The Solution
> 1.  **Data Model:** Updated `Portal.model.ContentSection.mjs` to include the `color` field.
> 2.  **Data Logic:** Updated `Component.mjs` to resolve semantic colors:
>     -   **Labels:** Looked up from the `labels` store (e.g., `bug` -> Red).
>     -   **State:** Mapped locally (Closed -> Purple, Reopened -> Green).
> 3.  **Visuals:** Updated `TicketCanvas.mjs` (Worker):
>     -   Receives the Hex color.
>     -   Converts Hex to RGB.
>     -   Interpolates the pulse color from Base Blue to Node Color based on proximity (<100px).
>     -   Uses `setTimeout` (1000/60) for compatibility with SharedWorkers (no rAF).
> 
> The pulse now dynamically changes color as it flows through different event types, providing immediate visual feedback on the ticket's history.

- 2026-01-11T14:17:53Z @tobiu assigned to @tobiu
- 2026-01-11T14:18:06Z @tobiu closed this issue

