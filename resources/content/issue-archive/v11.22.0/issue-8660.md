---
id: 8660
title: 'HeaderCanvas: Visualize Active View State'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-15T00:27:36Z'
updatedAt: '2026-01-15T00:43:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8660'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T00:43:56Z'
---
# HeaderCanvas: Visualize Active View State

Connect the `ViewportController`'s `activeIndex` state to the `HeaderCanvas` to visually highlight the active navigation item.

**Tasks:**
1.  **ViewportController**: Implement logic to identify the active button ID based on the current route/index and pass it to the `HeaderCanvas`.
2.  **HeaderCanvas (App Worker)**: Add `activeId` config and propagate it to the Shared Worker.
3.  **HeaderCanvas (Shared Worker)**:
    -   Receive `activeId`.
    -   Enhance `getStreamOffset` to recognize the active item.
    -   Implement visual highlighting (e.g., permanent high-intensity orbit, overlay glow) for the active navigation element.

## Timeline

- 2026-01-15T00:27:36Z @tobiu added the `enhancement` label
- 2026-01-15T00:27:37Z @tobiu added the `ai` label
- 2026-01-15T00:43:07Z @tobiu referenced in commit `4be8805` - "feat: Implement 'Energy Surge' active state visualization for HeaderCanvas (#8660)"
- 2026-01-15T00:43:16Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-15T00:43:26Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Energy Surge" visual effect to highlight the active navigation item.
> 
> **Implementation Details:**
> 1.  **Shared Worker (`HeaderCanvas.mjs`)**:
>     -   Removed the unsuccessful "Focus Field" overlay.
>     -   Implemented `drawActiveOverlay` as a multi-pass render. It redraws the existing stream geometry *only* for the segment corresponding to the active item.
>     -   This segment uses a white stroke (`#FFFFFF`) with a high `shadowBlur` (20px) to simulate a high-energy state.
>     -   Applied a faster alpha oscillation ("nervous pulse") to distinguish it from the calmer ambient stream.
>     -   Reverted previous distortion logic in `getStreamOffset` to maintain clean geometry.
> 
> 2.  **App Worker (`ViewportController`, `HeaderCanvas`)**:
>     -   Connected `activeIndex` changes in `ViewportController` to the `HeaderCanvas`.
>     -   Passed the `activeId` to the Shared Worker via the `activeId_` reactive config.
> 
> 3.  **Documentation**:
>     -   Updated `HeaderCanvas.mjs` class documentation.
>     -   Added a new "Active State Visualization" section to `learn/guides/advanced/CanvasArchitecture.md` explaining the technique.
> 
> The result is a semantic highlight that integrates seamlessly with the "Luminous Flux" theme without adding clashing geometry.

- 2026-01-15T00:43:41Z @tobiu added parent issue #8630
- 2026-01-15T00:43:56Z @tobiu closed this issue

