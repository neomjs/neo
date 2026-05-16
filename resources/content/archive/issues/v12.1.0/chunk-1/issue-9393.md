---
id: 9393
title: 'E2E: Implement GridRowScrollPinning via CSS Variables'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-08T16:22:55Z'
updatedAt: '2026-03-08T16:24:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9393'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-08T16:24:33Z'
---
# E2E: Implement GridRowScrollPinning via CSS Variables

This ticket tracks the implementation of the CSS Variables strategy for Optical Row Pinning, designed to perfectly satisfy the two core goals:
1.  **Leave wheel based scrolling alone.**
2.  **Ensure rows are visible on massive thumb drags (heal on scroll end).**

**The Implementation:**
1.  **CSS Variables (`Neo.grid.Row`):** Injected `var(--grid-row-pin-offset, 0px)` into the base `translate3d` template string for all rows. This allows bulk optical shifting of the entire row pool via the browser's hardware-accelerated CSS engine, without requiring structural DOM changes or VDOM interception.
2.  **Synchronous Engine (`GridRowScrollPinning`):** The addon now listens to the native `scroll` event and synchronously calculates the `deltaY` against the worker's baseline.
3.  **Absolute Threshold:** A high absolute threshold (e.g., `500px`) is used to ensure the addon *completely ignores* normal wheel scrolling, allowing native physics to govern small movements perfectly. It only engages to "freeze" the stale rows on the screen during massive scrollbar thumb drags, preventing the white flash.
4.  **Healing:** The VDOM `onDeltaUpdate` event synchronously clears the CSS variable (`0px`) when the worker finally catches up, snapping the fresh data into place.

## Timeline

- 2026-03-08T16:22:56Z @tobiu added the `enhancement` label
- 2026-03-08T16:22:56Z @tobiu added the `ai` label
- 2026-03-08T16:22:56Z @tobiu added the `architecture` label
- 2026-03-08T16:22:57Z @tobiu added the `grid` label
- 2026-03-08T16:23:04Z @tobiu added parent issue #9380
- 2026-03-08T16:23:56Z @tobiu referenced in commit `f23b49a` - "Enhancement: Implement GridRowScrollPinning via CSS Variables (#9393)

- Modified `Neo.grid.Row` to inject `var(--grid-row-pin-offset)` into the `translate3d` calculation.
- Refactored `GridRowScrollPinning` to a Synchronous Engine, eliminating `requestAnimationFrame`.
- Replaced direct DOM/VDOM transform mutations with synchronous CSS Variable updates.
- Increased pinning threshold to an absolute `500px` to completely ignore wheel scrolling while providing an unbreakable optical net for thumb drags.
- Updated Playwright E2E test to properly wait for ComboBox interactions before running telemetry."
- 2026-03-08T16:24:09Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-08T16:24:13Z

**Input from Gemini 3.1 Pro:**

> ✦ The CSS Variables architecture with the absolute `500px` threshold has been committed and pushed to the repository.
> 
> This marks a major pivot in the Epic strategy:
> - We acknowledge that perfect pixel-sync between native scroll and async workers is impossible without breaking UX or generating extreme jitter.
> - The 500px absolute threshold guarantees that the addon never triggers during normal or even fast wheel scrolling. Wheel physics remain 100% native and smooth.
> - The addon now functions exclusively as an "emergency net" for massive scrollbar thumb drags, mathematically freezing the stale rows on the screen to prevent users from staring at an empty void for 50-100ms.
> - It automatically heals (clears the CSS variable) when the VDOM update arrives.
> 
> Closing this sub-ticket to set our new baseline. We can now proceed to testing the DevIndex grid.

- 2026-03-08T16:24:33Z @tobiu closed this issue

