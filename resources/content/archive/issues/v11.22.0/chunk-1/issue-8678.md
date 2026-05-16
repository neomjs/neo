---
id: 8678
title: Implement Hero Container Wrapper
state: CLOSED
labels:
  - bug
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-15T03:29:32Z'
updatedAt: '2026-01-15T10:51:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8678'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T10:51:29Z'
---
# Implement Hero Container Wrapper

## Objective
Fix the "Sticky Canvas" issue where the Home Canvas remains fixed on screen while scrolling down to other sections.

## Tasks
1.  **Wrapper Component:** Create `Portal.view.home.HeroContainer` (or similar).
2.  **Composition:** Move `HomeCanvas` and `MainNeo` inside this container.
3.  **Positioning:** Ensure the Canvas is `absolute` positioned *within* the Container, not `fixed` to the viewport.
4.  **Lifecycle Verification:** Verify that scrolling the Hero out of view triggers `pause()`, and scrolling back triggers `resume()`. This effectively tests the visibility observer.

## Timeline

- 2026-01-15T03:29:32Z @tobiu assigned to @tobiu
- 2026-01-15T03:29:34Z @tobiu added the `bug` label
- 2026-01-15T03:29:34Z @tobiu added the `ai` label
- 2026-01-15T03:29:34Z @tobiu added the `architecture` label
- 2026-01-15T03:29:46Z @tobiu added parent issue #8661
- 2026-01-15T10:50:24Z @tobiu referenced in commit `62fc83d` - "refactor: Implement HeroContainer architecture (#8678)"
### @tobiu - 2026-01-15T10:50:38Z

**Input from Gemini 3 Pro:**

> ✦ Refactored the Home Hero section into a dedicated `parts/hero/` namespace to resolve the "Sticky Canvas" issue (#8678) and improve architectural clarity.
> 
> **Key Changes:**
> 1.  **New Architecture:** Created `apps/portal/view/home/parts/hero/` containing:
>     -   `Container.mjs`: Extends `BaseContainer`. Wraps the visual content and the background canvas. Handles `activate`/`deactivate` lifecycle hooks triggered by `MainContainer`'s Scroll Spy.
>     -   `Content.mjs`: (Refactored `MainNeo.mjs`). Extends `Neo.container.Base`. Contains the Logo, MagicMoveText, and Buttons.
>     -   `Canvas.mjs`: (Refactored `HomeCanvas.mjs`). Extends `Neo.component.Canvas`. The absolute positioned background.
> 2.  **Fixed Sticky Canvas:** The canvas is now absolutely positioned *within* the scrolling `HeroContainer`, ensuring it moves with the page content instead of being fixed to the viewport.
> 3.  **Corrected Lifecycle:** The `activate`/`deactivate` signals from `MainContainer` are now correctly received by `HeroContainer` (which has the `portal-home-content-view` class) and delegated to the canvas to pause/resume the worker loop.
> 4.  **Refactored Styles:** Moved and renamed SCSS files to `resources/scss/src/apps/portal/home/parts/hero/` and updated selectors to match the new component structure.
> 
> This change modifies the scope of the original implementation but ensures a more robust and scalable foundation for the Neural Swarm features.

- 2026-01-15T10:51:29Z @tobiu closed this issue

