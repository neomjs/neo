---
id: 8963
title: 'Feat: Smooth Data Transitions for Sparklines'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-03T13:01:31Z'
updatedAt: '2026-02-03T13:29:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8963'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-03T13:29:55Z'
---
# Feat: Smooth Data Transitions for Sparklines

Currently, when the data array for a Sparkline changes, the chart snaps instantly to the new shape.

**Task:**
Implement a smooth transition animation (approx. 200ms - 300ms) when the `values` array is updated. The chart points should interpolate from their old positions to the new ones.

**Details:**
-   Handle the transition in the Worker renderer (`src/canvas/Sparkline.mjs`).
-   Ensure the animation is performant and interrupts gracefully if new data arrives during a transition.
-   Consider how this interacts with the "Pulse" animation (it should probably pause or blend).

## Timeline

- 2026-02-03T13:01:33Z @tobiu added the `enhancement` label
- 2026-02-03T13:01:33Z @tobiu added the `ai` label
- 2026-02-03T13:01:57Z @tobiu added parent issue #8930
- 2026-02-03T13:26:58Z @tobiu referenced in commit `331d58f` - "Feat: Smooth Data Transitions for Sparklines (#8963)"
### @tobiu - 2026-02-03T13:29:32Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented smooth data transition animations for `Neo.canvas.Sparkline`.
> 
> **Changes:**
> 1.  **`src/component/Sparkline.mjs`**: Added `useTransition_` config (default: `true`). This allows developers to toggle the animation on/off.
> 2.  **`src/canvas/Sparkline.mjs`**:
>     -   Updated `renderLoop` to handle value interpolation using a Cubic Ease-Out curve.
>     -   Updated `updateData` to initialize the transition if `useTransition` is enabled.
>     -   Ensured instantaneous updates for initial loads or when `useTransition` is false.
> 
> **Outcome:**
> When the `values` array of a Sparkline component updates, the chart points now glide smoothly to their new positions over 300ms, instead of snapping instantly. This creates a more polished, "living" data visualization experience.

- 2026-02-03T13:29:42Z @tobiu assigned to @tobiu
- 2026-02-03T13:29:55Z @tobiu closed this issue

