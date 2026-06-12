---
id: 8654
title: Optimize Global MouseMove with rAF Throttling
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T20:08:24Z'
updatedAt: '2026-01-14T22:11:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8654'
author: tobiu
commentsCount: 0
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T22:11:30Z'
---
# Optimize Global MouseMove with rAF Throttling

## Objective
Optimize `mousemove` event handling by implementing requestAnimationFrame (rAF) throttling in the Main Thread (`Neo.main.DomEvents`). This allows us to remove the `delayable` config in the App Worker components, reducing the number of messages sent across the worker bridge.

## Tasks
1.  **Update `src/manager/DomEvent.mjs`:** Add `mousemove` to the `handlerMap` to route local listeners to the new specialized handler.
2.  **Update `src/main/DomEvents.mjs`:**
    -   Implement `onMouseMove` handler.
    -   Add rAF throttling logic to ensure only the latest mousemove event is sent per animation frame.
3.  **Update `apps/portal/view/HeaderCanvas.mjs`:** Remove the `delayable` (throttle) config for `onMouseMove` as it is now handled at the source.


## Timeline

- 2026-01-14T20:08:26Z @tobiu added the `enhancement` label
- 2026-01-14T20:08:26Z @tobiu added the `ai` label
- 2026-01-14T20:44:33Z @tobiu referenced in commit `217b4c9` - "enhancement: Optimize Global MouseMove with rAF Throttling & Use Local MouseMove Listener (#8654)"
- 2026-01-14T20:44:33Z @tobiu referenced in commit `8f77979` - "fix: Resolve Duplicate DomListeners & Missing MouseMove on HeaderCanvas (#8654)"
- 2026-01-14T20:58:12Z @tobiu referenced in commit `68d5c9a` - "refactor: Implement Parent Delegation for HeaderCanvas Events (#8654)"
- 2026-01-14T21:11:51Z @tobiu referenced in commit `5b28c82` - "fix: Resolve TypeError in getEventData & Remove Debug Logs (#8654)"
- 2026-01-14T21:11:51Z @tobiu referenced in commit `672f317` - "fix: Capture mousemove data synchronously to preserve event path (#8654)"
- 2026-01-14T21:28:08Z @tobiu referenced in commit `f936156` - "style: Tune HeaderCanvas Ether visibility (boost opacity) (#8654)"
- 2026-01-14T22:11:15Z @tobiu assigned to @tobiu
- 2026-01-14T22:11:31Z @tobiu closed this issue
- 2026-01-14T22:11:39Z @tobiu added parent issue #8630

