---
id: 8940
title: 'Feat: Activity Sparkline Column'
state: CLOSED
labels:
  - enhancement
  - design
assignees:
  - tobiu
createdAt: '2026-02-01T16:44:23Z'
updatedAt: '2026-02-02T00:17:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8940'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-02T00:17:22Z'
---
# Feat: Activity Sparkline Column

This task focuses on implementing a visual Sparkline to show activity trends over the last 15 years.

### Requirements
1.  **Component:** Create a custom `Neo.grid.column.Component` implementation that uses HTML5 Canvas (or OffscreenCanvas).
2.  **Rendering:** Draw a line chart representing the yearly contribution data (`y2010` - `y2025`).
3.  **Grid Integration:** Add this component column to the grid.

### Acceptance Criteria
- A sparkline chart appears in each row, visualizing the user's activity history.
- Scrolling performance remains high (component recycling).


## Timeline

- 2026-02-01T16:44:24Z @tobiu added the `enhancement` label
- 2026-02-01T16:44:24Z @tobiu added the `design` label
- 2026-02-01T16:44:35Z @tobiu added parent issue #8930
- 2026-02-01T16:44:54Z @tobiu assigned to @tobiu
- 2026-02-02T00:16:12Z @tobiu referenced in commit `efb2961` - "feat: Implement Activity Sparkline Column (#8940)"
### @tobiu - 2026-02-02T00:16:44Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the Activity Sparkline column.
> - **SparklineComponent:** Created a wrapper extending `Neo.component.Canvas` to handle the offscreen canvas.
> - **Sparkline Worker:** Implemented `apps/devrank/canvas/Sparkline.mjs` to draw the line chart using HTML5 Canvas API in the `canvas` worker.
> - **Grid Integration:** Added the column to `GridContainer` using `component` config to pass year data (2010-2025).
> - **Configuration:** Enabled `useCanvasWorker: true` in `neo-config.json` and set up the `canvas.mjs` entry point.
> 
> The sparkline visualizes the 15-year contribution trend for each user.

- 2026-02-02T00:17:22Z @tobiu closed this issue

