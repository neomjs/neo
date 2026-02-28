---
id: 9079
title: 'Feat: DevRank Header "Show Off" Kinetic Scroll Effect'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-10T02:09:16Z'
updatedAt: '2026-02-10T02:10:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9079'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T02:10:39Z'
---
# Feat: DevRank Header "Show Off" Kinetic Scroll Effect

Implement a "Show Off" visual effect where the Header Canvas animation accelerates and shifts colors when the Grid is scrolled.

**Objective:**
Visually demonstrate the multi-threaded architecture by doubling the load on the Canvas SharedWorker precisely when the App Worker is busy handling Grid scrolling.

**Implementation:**
1.  **Grid Body:** Fire `isScrollingChange` event.
2.  **Viewport Controller:** Listen to grid scroll state and invoke `HeaderCanvas.updateTimeScale(2)`.
3.  **Header Canvas:**
    -   Implement `timeScale` with smooth easing.
    -   Add "Hot" gradients (White/Cyan).
    -   Draw a high-intensity overlay pass when `timeScale > 1`.


## Timeline

- 2026-02-10T02:09:17Z @tobiu added the `enhancement` label
- 2026-02-10T02:09:17Z @tobiu added the `ai` label
- 2026-02-10T02:09:26Z @tobiu added parent issue #8930
- 2026-02-10T02:09:50Z @tobiu referenced in commit `ed02558` - "Feat: DevRank Header "Show Off" Kinetic Scroll Effect (#9079)"
### @tobiu - 2026-02-10T02:10:16Z

**Input from Gemini 3 Pro:**

> ✦ Task completed.
> 
> ### Implemented Features
> 1.  **Kinetic Acceleration:** The header canvas animation speed now doubles (`timeScale: 2`) when the user scrolls the grid, and smoothly decelerates back to idle (`timeScale: 1`) when scrolling stops.
> 2.  **Kinetic Color Shift:**
>     -   When accelerating, the energy streams "ignite", transitioning from the standard theme colors to a high-intensity **White-Hot** glow.
>     -   This is achieved via a secondary overlay pass using cached "Hot" gradients (White/Cyan) with an alpha value tied to the acceleration curve.
> 3.  **Architecture:**
>     -   **Grid Body:** Added `isScrollingChange` event.
>     -   **Viewport Controller:** Bridges the Grid's scroll state to the Header Canvas.
>     -   **Header Canvas (SharedWorker):** Implements the physics, easing, and dual-pass rendering logic.
> 
> ### Outcome
> This feature serves as a visceral demonstration of the Neo.mjs multi-threaded architecture. By **increasing** the rendering load during the heaviest UI operation (scrolling), it visually proves the isolation of the App Worker (Grid) and the Canvas Worker (Header).
> 

- 2026-02-10T02:10:25Z @tobiu assigned to @tobiu
- 2026-02-10T02:10:39Z @tobiu closed this issue
- 2026-02-10T02:16:11Z @tobiu cross-referenced by #9080

