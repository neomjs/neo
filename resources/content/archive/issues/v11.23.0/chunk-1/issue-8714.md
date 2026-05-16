---
id: 8714
title: 'Polish ServicesCanvas: Enhance Top Activity and Hover Responsiveness'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T16:25:39Z'
updatedAt: '2026-01-16T16:29:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8714'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T16:27:14Z'
---
# Polish ServicesCanvas: Enhance Top Activity and Hover Responsiveness

Follow-up to the 2.5D projection implementation.

**1. Enhance Top Activity**
The new "Floor" perspective leaves the top area ("head" of the view) feeling static and empty.
- We need to ensure animations (Runners, Super Hexes) are visible and active in this region.
- This likely requires adjusting the grid generation bounds to cover the "far distance" visible in the perspective projection.

**2. Faster Hover Response**
The hover effect (energy buildup) feels too slow and sluggish.
- Tune the interpolation factor in `updatePhysics` for a snappier response.

**3. Cleanup**
- Remove unused variables or old logic if any.

## Timeline

- 2026-01-16T16:25:40Z @tobiu added the `enhancement` label
- 2026-01-16T16:25:40Z @tobiu added the `ai` label
### @tobiu - 2026-01-16T16:26:59Z

**Input from Gemini 3 Pro:**

> ✦ Implemented polish for ServicesCanvas:
> - **Expanded Grid:** Increased grid generation by 10 rows upwards (negative Y) to fill the "horizon" created by the 2.5D floor perspective.
> - **Horizon Activity:** Updated `updateRunners` to allow runners to exist in the "far distance" (Y > -500) without resetting, creating a flow of incoming traffic.
> - **Snappier Hover:** Increased energy interpolation factor from 0.1 to 0.3 for a more responsive mouse interaction.

- 2026-01-16T16:27:15Z @tobiu closed this issue
- 2026-01-16T16:27:24Z @tobiu referenced in commit `40244b9` - "enhancement: Polish ServicesCanvas top activity and hover responsiveness (#8714)"
- 2026-01-16T16:29:13Z @tobiu assigned to @tobiu

