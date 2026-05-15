---
id: 9389
title: 'E2E: Remove Legacy Scroll Prediction Heuristics from Grid ScrollManager'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-08T12:09:12Z'
updatedAt: '2026-03-08T12:13:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9389'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-08T12:13:26Z'
---
# E2E: Remove Legacy Scroll Prediction Heuristics from Grid ScrollManager

With the successful implementation of the deterministic `GridRowScrollPinning` Main Thread addon (which uses the `meta` payload to perfectly align VDOM `translate3d` deltas), the legacy velocity and acceleration-based predictive scrolling heuristics are obsolete.

**Task:**
Refactor `Neo.grid.ScrollManager` to remove the predictive math and simplify the scroll synchronization logic.

**Implementation Steps:**
1. **Remove Properties:** Delete `lastScrollTime`, `lastScrollTop`, `scrollAcceleration`, and `scrollVelocity` from `Neo.grid.ScrollManager`.
2. **Simplify `onBodyScroll` / `onContainerScroll`:** Remove the `performance.now()` calculations for `dt`, `newVelocity`, and `scrollAcceleration`.
3. **Simplify `onBodyScrollEnd`:** Remove the resetting of velocity and acceleration.
4. **Simplify `syncGridBody`:** Remove the kinematic equation logic (`d = v*t + 0.5*a*t^2`) and the use of `Performance.getAverage`. `syncGridBody` should now just directly sync `scrollTop` and `scrollLeft` to the body and call `createViewData()`.

## Timeline

- 2026-03-08T12:09:13Z @tobiu added the `enhancement` label
- 2026-03-08T12:09:13Z @tobiu added the `ai` label
- 2026-03-08T12:09:13Z @tobiu added the `architecture` label
- 2026-03-08T12:09:14Z @tobiu added the `grid` label
- 2026-03-08T12:09:20Z @tobiu added parent issue #9380
- 2026-03-08T12:11:50Z @tobiu referenced in commit `dec9f92` - "Enhancement: Remove Legacy Scroll Prediction Heuristics from Grid ScrollManager (#9389)

- Removed legacy velocity and acceleration tracking properties (`lastScrollTime`, `lastScrollTop`, `scrollAcceleration`, `scrollVelocity`).
- Simplified `onBodyScroll`, `onBodyScrollEnd`, and `syncGridBody` methods to directly sync the actual `scrollTop` state.
- The obsolete kinematic equation heuristics are fully replaced by the deterministic `GridRowScrollPinning` addon."
### @tobiu - 2026-03-08T12:12:03Z

**Input from Gemini 3.1 Pro:**

> ✦ The legacy velocity and acceleration-based predictive scrolling heuristics have been successfully removed from `Neo.grid.ScrollManager`. The synchronization logic is now purely deterministic.
> 
> Changes are pushed. Closing this ticket.

- 2026-03-08T12:13:07Z @tobiu assigned to @tobiu
- 2026-03-08T12:13:26Z @tobiu closed this issue

