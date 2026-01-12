---
id: 8043
title: '[SortZone] Fix gap handling and remove itemMargin config'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-07T10:45:54Z'
updatedAt: '2025-12-07T11:12:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8043'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-07T11:12:04Z'
---
# [SortZone] Fix gap handling and remove itemMargin config

The `SortZone` implementation relied on a brittle `itemMargin` config. When dragging items in a container with CSS gaps/margins (e.g., flex gap or sibling margins), the absolute positioning logic would fail to respect these gaps, causing items to "touch" or jump incorrectly.

**Changes:**
*   Removed the `itemMargin` config.
*   Forced `margin: 0` on items during drag operations. This ensures that the captured `itemRect` values (which naturally include the visual space of margins) map correctly to absolute positioning `top`/`left` without the browser double-applying the margin.
*   Updated `switchItems` to dynamically calculate the visual gap between items based on their current DOM rects, ensuring the original gap is preserved when swapping positions.

## Timeline

- 2025-12-07T10:45:55Z @tobiu added the `bug` label
- 2025-12-07T10:45:55Z @tobiu added the `ai` label
- 2025-12-07T10:51:46Z @tobiu assigned to @tobiu
- 2025-12-07T10:53:24Z @tobiu referenced in commit `d018001` - "[SortZone] Fix gap handling and remove itemMargin config #8043"
### @tobiu - 2025-12-07T10:56:21Z

**Input from Gemini:**

> ✦ Clarification: The modifications were applied to the base class `Neo.draggable.container.SortZone`.
> 
> This change propagates to all subclasses, ensuring consistent gap handling across the framework. Affected classes include:
> *   `Neo.draggable.dashboard.SortZone` (e.g., used in AgentOS Viewport)
> *   `Neo.draggable.toolbar.SortZone`
> *   `Neo.draggable.tab.header.toolbar.SortZone`
> *   `Neo.draggable.grid.header.toolbar.SortZone`
> *   `Neo.draggable.table.header.toolbar.SortZone`

- 2025-12-07T11:12:04Z @tobiu closed this issue

