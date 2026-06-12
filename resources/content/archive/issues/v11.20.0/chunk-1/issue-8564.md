---
id: 8564
title: Reset TicketCanvas animation on data load
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T23:31:53Z'
updatedAt: '2026-01-11T23:33:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8564'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T23:33:50Z'
---
# Reset TicketCanvas animation on data load

When switching between tickets, the `TicketCanvas` animation (the "pulse") currently continues from its previous vertical position (`pulseY`). This feels unnatural as the context has completely changed.

We should reset the animation to the top (`pulseY = PHYSICS.pulseBounds`) whenever new data is loaded (i.e., when switching tickets), but NOT when resizing the window (where continuity is preferred).

**Proposed Change:**
1.  Update `TicketCanvas.updateGraphData` to accept a `reset` boolean flag.
2.  If `reset` is true, set `me.pulseY = PHYSICS.pulseBounds`.
3.  Update `TimelineCanvas.onTimelineDataLoad` to pass `reset: !isResize` when calling `updateGraphData`.


## Timeline

- 2026-01-11T23:31:53Z @tobiu added the `enhancement` label
- 2026-01-11T23:31:54Z @tobiu added the `ai` label
- 2026-01-11T23:32:58Z @tobiu referenced in commit `246a84d` - "feat: Reset TicketCanvas animation on new data load (#8564)"
- 2026-01-11T23:33:07Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T23:33:25Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the animation reset logic.
> 
> **Changes:**
> - Modified `TicketCanvas.updateGraphData` to accept a `reset` boolean. If true, it resets `pulseY` to the top bounds.
> - Modified `TimelineCanvas.onTimelineDataLoad` to pass `reset: !isResize`. This ensures the animation restarts when switching tickets (loading new data) but continues smoothly during window resizing.
> 
> This provides a more natural UX where new ticket content starts the visualization from the beginning.

- 2026-01-11T23:33:32Z @tobiu added parent issue #8398
- 2026-01-11T23:33:50Z @tobiu closed this issue

