---
id: 9390
title: 'E2E: Fix GridRowScrollPinning Registration and DOM Lookup Flaws'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-08T13:03:11Z'
updatedAt: '2026-03-08T13:04:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9390'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-08T13:04:14Z'
---
# E2E: Fix GridRowScrollPinning Registration and DOM Lookup Flaws

This ticket documents and summarizes the critical bug fixes and architectural cleanups applied to the `GridRowScrollPinning` Main Thread addon and its integration with the `ScrollManager` to resolve initial integration failures.

**Completed Fixes & Cleanups:**

1.  **Registration Fix (`ScrollManager`):** The initial implementation guarded the registration inside `afterSetRowScrollPinning` with `if (oldValue !== undefined)`. Because the config defaults to `true`, this prevented the addon from ever registering. The guard was removed.
2.  **Missing Action Property Support (`GridRowScrollPinning`):** `Neo.vdom.Helper.compareAttributes` does not explicitly set `action: 'updateNode'` on deltas, relying on the main thread to default to it. The addon's strict check `delta.action === 'updateNode'` caused it to ignore all incoming row updates. The check was updated to `(!delta.action || delta.action === 'updateNode')`.
3.  **Negative Scroll Transform Support (Regex):** When rows are recycled and moved out of bounds, the App Worker can calculate negative `Y` transforms (e.g., `translate3d(0px, -50px, 0px)`). The initial regex `\d+` only matched positive integers, causing negative transform strings to be ignored, resulting in massive row overlapping. The regex was updated to `/-?\d+(?:\.\d+)?/` and parsing was switched to `parseFloat`.
4.  **Targeting the Correct DOM Node for ScrollTop:** The original implementation queried the outer `grid-body` node for `scrollTop`, which was always `0`. The addon was updated to explicitly append the `__wrapper` suffix to target the internal scrollable container node (`DomAccess.getElement(registration.bodyId + '__wrapper')`).
5.  **Performance & Architectural Cleanup:**
    *   The `translateRegex` was extracted to a module-level constant to prevent expensive recompilation on every row iteration.
    *   Reverted a temporary hack in `ScrollManager` that passed the `__wrapper` suffix in the registry ID, restoring the clean `bodyId` registry pattern.

## Timeline

- 2026-03-08T13:03:12Z @tobiu added the `enhancement` label
- 2026-03-08T13:03:12Z @tobiu added the `ai` label
- 2026-03-08T13:03:13Z @tobiu added the `architecture` label
- 2026-03-08T13:03:13Z @tobiu added the `grid` label
- 2026-03-08T13:03:25Z @tobiu added parent issue #9380
- 2026-03-08T13:03:43Z @tobiu referenced in commit `5f3152d` - "Enhancement: Fix GridRowScrollPinning Registration and DOM Lookup Flaws (#9390)

- Fixed addon registration in ScrollManager.
- Updated addon to handle missing action properties in VDOM deltas.
- Fixed regex to support negative translate3d Y values.
- Fixed DOM lookup to target the correct __wrapper node for scrollTop.
- Extracted regex to a module-level constant for performance."
### @tobiu - 2026-03-08T13:03:51Z

**Input from Gemini 3.1 Pro:**

> ✦ I have committed and pushed the fixes summarizing our last few debugging turns.
> 
> The `GridRowScrollPinning` addon now correctly registers, finds the `__wrapper` DOM node to calculate accurate `scrollTop` values, parses negative/float `translate3d` values via a constant regex, and accounts for `delta.action` being implicitly undefined in VDOM attribute updates.
> 
> Closing this ticket so we can move on to analyzing the remaining visual flaws in the pinning logic.

- 2026-03-08T13:04:01Z @tobiu assigned to @tobiu
- 2026-03-08T13:04:14Z @tobiu closed this issue

